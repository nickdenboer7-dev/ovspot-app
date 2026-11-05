#!/usr/bin/env python3
"""OVspot app-API v1 — lichte API voor de OVspot-app (Dichtbij, haltebord, ritverloop, storingen, zoeken).

Haalt alle data intern op bij OVbord (127.0.0.1:8095) en geeft alleen de velden terug die de app nodig heeft.
Alleen standaardbibliotheek. Luistert op 127.0.0.1:8110; Nginx stuurt /app/v1/ hierheen.
Schrijft niets weg en raakt OVspot (:5000) en OVbord (:8095) niet aan.
"""
import gzip
import hashlib
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo

VERSION = "1.1.0-staging"
OVBORD = os.environ.get("OVSPOT_APP_OVBORD", "http://127.0.0.1:8095").rstrip("/")
HOST = os.environ.get("OVSPOT_APP_HOST", "127.0.0.1")
PORT = int(os.environ.get("OVSPOT_APP_PORT", "8110"))
PREFIX = "/app/v1"
TZ = ZoneInfo("Europe/Amsterdam")
USER_AGENT = "ovspot-app-api/" + VERSION

POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="ovspot-app")
STARTED = time.time()

TTL_HALTE = 10.0
TTL_NEARBY = 30.0
TTL_RIT = 4.0
TTL_STORING = 60.0
TTL_ZOEK = 120.0


class NotFound(Exception):
    pass


class Upstream(Exception):
    pass


class BadRequest(Exception):
    pass


# ---------------------------------------------------------------- cache ----

class TTLCache:
    """Kleine cache met maximale grootte en per-sleutel slot (geen dubbele upstream-verzoeken)."""

    def __init__(self, max_items=3000):
        self.max_items = max_items
        self.data = {}
        self.lock = threading.Lock()
        self.key_locks = {}

    def get(self, key, ttl, fn):
        now = time.time()
        with self.lock:
            hit = self.data.get(key)
            if hit and now - hit[0] < ttl:
                return hit[1]
            klock = self.key_locks.setdefault(key, threading.Lock())
        with klock:
            with self.lock:
                hit = self.data.get(key)
                if hit and time.time() - hit[0] < ttl:
                    return hit[1]
            value = fn()
            with self.lock:
                self.data[key] = (time.time(), value)
                if len(self.data) > self.max_items:
                    for old in sorted(self.data, key=lambda k: self.data[k][0])[: len(self.data) - self.max_items]:
                        self.data.pop(old, None)
                        self.key_locks.pop(old, None)
            return value


CACHE = TTLCache()


def ovbord(path, timeout=8.0):
    req = urllib.request.Request(OVBORD + path, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            try:
                msg = json.loads(exc.read().decode("utf-8")).get("error")
            except Exception:
                msg = None
            raise NotFound(msg or "Niet gevonden") from exc
        raise Upstream(f"OVbord gaf {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise Upstream("OVbord niet bereikbaar") from exc


# ------------------------------------------------------------ helpers ----

def parse_iso(value):
    raw = str(value or "").strip()
    if not raw or ":" not in raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    return dt.astimezone(TZ)


def hhmm(dt):
    return dt.strftime("%H:%M") if dt else ""


def epoch_ms(dt):
    return int(dt.timestamp() * 1000) if dt else None


def now_iso():
    return datetime.now(TZ).isoformat(timespec="seconds")


CARRIERS = {
    "QBUZZ": "Qbuzz", "ARR": "Arriva", "ARRIVA": "Arriva", "CXX": "Connexxion", "EBS": "EBS", "GVB": "GVB",
    "HTM": "HTM", "RET": "RET", "KEOLIS": "Keolis", "SYNTUS": "Keolis", "OVERAL": "Keolis", "DOEKSEN": "Doeksen",
    "TESO": "TESO", "WAGENBORG": "Wagenborg", "UOV": "U-OV", "WATERBUS": "Waterbus", "NS": "NS",
    "BLAUWNET": "Blauwnet", "RRREIS": "RRReis", "ALLGO": "allGo", "TWENTS": "Twents", "BRENG": "Breng",
}


def carrier_name(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    key = re.sub(r"^IFF:", "", raw.upper()).split("_")[0]
    if key in CARRIERS:
        return CARRIERS[key]
    return raw.title() if raw.isupper() and len(raw) > 4 else raw


TRAIN_NAMES = {
    "intercity": "IC", "intercity direct": "ICD", "sprinter": "SPR", "stoptrein": "ST", "sneltrein": "ST",
    "eurocity": "EC", "eurocity direct": "ECD", "ice international": "ICE", "ice": "ICE", "eurostar": "EST",
    "nightjet": "NJ", "european sleeper": "ES", "trein": "Trein",
}


def short_line(line, mode):
    name = str(line or "").strip()
    low = name.lower()
    if mode == "train":
        if low in TRAIN_NAMES:
            return TRAIN_NAMES[low]
        m = re.match(r"^(?:stoptrein|sneltrein|sprinter|intercity)\s+([A-Za-z]{1,3}\s?\d{1,3})$", name, re.I)
        if m:
            return m.group(1).replace(" ", "").upper()
    if "ipv trein" in low or "i.p.v. trein" in low:
        return "Bus"
    if len(name) > 6:
        first = name.split()[0]
        return first[:6]
    return name or ("Trein" if mode == "train" else "Bus")


def split_name(name, train=False):
    """'Leeuwarden, Blokhuisplein' -> ('Blokhuisplein', 'Leeuwarden'); treinstation zonder komma -> 'Station X'."""
    full = str(name or "").strip() or "Halte"
    if ", " in full:
        plaats, naam = full.split(", ", 1)
        naam = naam.strip()
        if naam.startswith("(") and naam.endswith(")"):
            naam = naam[1:-1].strip()
        return naam or full, plaats.strip()
    if train:
        return "Station " + full, full
    return full, ""


def rit_ref(row):
    trip = str(row.get("gtfs_trip_id") or "").strip()
    day = str(row.get("service_date") or "").strip()
    vehicle = str(row.get("journey_id") or "").strip()
    if vehicle.startswith("gtfs/"):
        vehicle = ""
    if trip and re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        ref = {"trip": trip, "datum": day}
        if vehicle:
            ref["voertuig"] = vehicle
        return ref
    if vehicle:
        return {"voertuig": vehicle}
    return None


def map_departure(d):
    mode = str(d.get("mode") or "bus").lower()
    planned = parse_iso(d.get("planned_at"))
    effective = parse_iso(d.get("effective_time")) or planned
    planned = planned or effective
    cancelled = bool(d.get("cancelled"))
    live = bool(d.get("live") or d.get("timing_live")) and not cancelled
    try:
        delay_s = int(round(float(d.get("delay") or 0)))
    except (TypeError, ValueError):
        delay_s = 0
    # OVspot-regel: te vroeg rijden tonen we niet; aftellen dan op geplande tijd.
    shown = effective
    if planned and effective and effective < planned:
        shown = planned
    delay_min = int(round(delay_s / 60.0)) if live and delay_s >= 60 else 0
    line = str(d.get("line") or "").strip()
    return {
        "lijn": short_line(line, mode),
        "lijn_naam": line,
        "modus": mode,
        "bestemming": str(d.get("destination") or "Bestemming onbekend").strip(),
        "vervoerder": carrier_name(d.get("carrier") or d.get("agency_id")),
        "gepland": str(d.get("planned_time") or hhmm(planned)),
        "verwacht": hhmm(shown),
        "vertrek_ms": epoch_ms(shown),
        "vertraging_min": delay_min,
        "live": live,
        "vervallen": cancelled,
        "spoor": str(d.get("platform") or "").strip(),
        "rit": rit_ref(d),
    }


def notice_kind(n):
    badge = str(n.get("badge") or "").strip()
    effect = str(n.get("effect") or "").upper()
    if effect in {"NO_SERVICE", "REDUCED_SERVICE"}:
        return "minder", "Minder vervoer"
    if badge in {"Halte vervalt", "Niet instappen"}:
        return "halte", badge
    if badge == "Haltewijziging":
        return "omleiding", badge
    if badge == "Omleiding" or effect == "DETOUR":
        return "omleiding", "Omleiding"
    if badge == "Vertraging" or effect == "SIGNIFICANT_DELAYS":
        return "omleiding", "Vertraging"
    return "info", badge or "Info"


def map_notice(n):
    title = str(n.get("title") or "").strip()
    text = str(n.get("description") or "").strip()
    if text.casefold() == title.casefold():
        text = ""
    kind, label = notice_kind(n)
    start = end = None
    periods = n.get("active_periods") or []
    if periods:
        try:
            starts = [p[0] for p in periods if p and p[0]]
            ends = [p[1] for p in periods if p and len(p) > 1 and p[1]]
            start = min(starts) if starts else None
            end = max(ends) if ends else None
        except (TypeError, ValueError):
            start = end = None
    key = hashlib.sha1((title + "\n" + text).casefold().encode("utf-8")).hexdigest()[:12]
    return {
        "id": key,
        "soort": kind,
        "label": label,
        "titel": title or label,
        "tekst": text,
        "lijnen": [str(x) for x in (n.get("lines") or []) if str(x).strip()],
        "ernst": str(n.get("severity") or "low"),
        "vanaf_ms": int(start) * 1000 if start else None,
        "tot_ms": int(end) * 1000 if end else None,
        "halte_ids": [str(x) for x in (n.get("stop_ids") or [])],
        "_skip": n.get("badge") == "Halte vervalt" or str(n.get("effect") or "").upper() == "STOP_SKIPPED",
    }


def public_notice(n):
    return {k: v for k, v in n.items() if not k.startswith("_")}


# ------------------------------------------------------------ halte ----

def ovbord_halte(stop_id):
    path = "/api/halte/" + urllib.parse.quote(stop_id, safe="")
    return CACHE.get("halte:" + stop_id, TTL_HALTE, lambda: ovbord(path))


def mode_filter(rows, modus):
    if modus == "trein":
        return [r for r in rows if r["modus"] == "train"]
    if modus == "bus":
        return [r for r in rows if r["modus"] != "train"]
    return rows


def upcoming(rows, now_ms):
    # Vertrokken ritten (meer dan 30 s geleden) laten we weg; vervallen blijven tot hun tijd voorbij is.
    return [r for r in rows if r["vertrek_ms"] is None or r["vertrek_ms"] >= now_ms - 30_000]


def halte(stop_id, modus="alles", limit=30):
    raw = ovbord_halte(stop_id)
    deps = [map_departure(d) for d in raw.get("departures") or []]
    if raw.get("stale"):
        for departure in deps:
            departure["live"] = False  # Geen actuele bevestiging uit een verouderd haltebord.
    deps = upcoming(deps, int(time.time() * 1000))
    deps.sort(key=lambda r: (r["vertrek_ms"] or 0))
    modes = sorted({r["modus"] for r in deps})
    naam, plaats = split_name(raw.get("name"), train="train" in modes)
    notices = [public_notice(map_notice(n)) for n in raw.get("disruptions") or []]
    return {
        "id": str(raw.get("stop_ref") or stop_id),
        "naam": naam,
        "plaats": plaats,
        "lat": raw.get("lat"),
        "lon": raw.get("lon"),
        "modi": modes,
        "bijgewerkt": raw.get("generated_at") or now_iso(),
        "verouderd": bool(raw.get("stale")),
        "vertrekken": mode_filter(deps, modus)[:limit],
        "storingen": notices,
    }


# ------------------------------------------------------------ dichtbij ----

def dichtbij(lat, lon, max_haltes=6, straal=1500, per_halte=2):
    key = f"nearby:{lat:.3f}:{lon:.3f}"
    path = f"/api/nearby?lat={lat:.6f}&lon={lon:.6f}"
    areas = CACHE.get(key, TTL_NEARBY, lambda: ovbord(path))
    if not isinstance(areas, list):
        areas = []
    chosen = [a for a in areas if isinstance(a, dict) and a.get("id")
              and (a.get("distance_m") is None or float(a.get("distance_m") or 0) <= straal)][:max_haltes]
    futures = {POOL.submit(halte, str(a["id"]), "alles", per_halte + 4): a for a in chosen}
    wait(futures, timeout=6.0)
    out = []
    for fut, area in futures.items():
        modes = [str(m) for m in area.get("modes") or []]
        naam, plaats = split_name(area.get("name"), train="train" in modes)
        item = {
            "id": str(area["id"]),
            "naam": naam,
            "plaats": plaats,
            "afstand_m": int(round(float(area.get("distance_m") or 0))),
            "lat": area.get("lat"),
            "lon": area.get("lon"),
            "modi": modes,
            "lijnen": [str(x) for x in (area.get("lines") or [])][:12],
            "vertrekken": [],
            "fout": None,
        }
        if fut.done() and not fut.exception():
            item["vertrekken"] = fut.result()["vertrekken"][:per_halte]
            item["storingen_aantal"] = len(fut.result()["storingen"])
        else:
            item["fout"] = "Vertrektijden tijdelijk niet beschikbaar"
            if not fut.done():
                fut.cancel()
        out.append(item)
    out.sort(key=lambda x: x["afstand_m"])
    return {"bijgewerkt": now_iso(), "haltes": out}


# ------------------------------------------------------------ rit ----

def rit_path(trip, datum, voertuig, ritid):
    if trip:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", datum or ""):
            raise BadRequest("datum ontbreekt of is ongeldig (JJJJ-MM-DD)")
        q = {"service_date": datum}
        if voertuig:
            q["vehicle"] = voertuig
        return "/api/rit/gtfs/" + urllib.parse.quote(trip, safe="") + "?" + urllib.parse.urlencode(q)
    if voertuig or ritid:
        return "/api/rit/" + urllib.parse.quote(voertuig or ritid, safe="")
    raise BadRequest("trip+datum of voertuig is nodig")


def sanitize_arrival_departure(arr, dep):
    """Onderdruk onmogelijke wachttijden; laat 23:59 -> 00:01 wel toe."""
    if not arr or not dep:
        return arr, dep
    def to_minutes(x):
        m = re.fullmatch(r"(\d{1,2}):(\d{2})", str(x))
        if not m or int(m[1]) > 23 or int(m[2]) > 59:
            return None
        return int(m[1]) * 60 + int(m[2])
    a, d = to_minutes(arr), to_minutes(dep)
    if a is None or d is None or (d - a) % 1440 > 15:
        return "", ""
    return arr, dep


def map_stop(s, skipped_ids):
    planned = s.get("planned_departure_time") if s.get("planned_departure_time") not in (None, "—") else s.get("planned_arrival_time")
    planned = planned if planned not in (None, "—") else ""
    shown = s.get("departure_time") if s.get("departure_time") not in (None, "—") else s.get("arrival_time")
    shown = shown if shown not in (None, "—") else (s.get("time") or "")
    delay = s.get("delay_seconds")
    try:
        delay_min = int(round(float(delay) / 60.0)) if delay is not None and float(delay) >= 60 else 0
    except (TypeError, ValueError):
        delay_min = 0
    # De routebron kan een vervroegde vertrekvoorspelling laten zien terwijl het
    # haltebord terecht niet eerder aftelt dan de geplande vertrektijd.
    # Gebruik voor die situatie de geplande ISO-tijd, NOOIT de effectieve epoch.
    planned_at = parse_iso(s.get("planned_departure_at")) or parse_iso(s.get("planned_arrival_at"))
    scheduled_ms = epoch_ms(planned_at)
    early = False
    for name in ("departure_delay_seconds", "delay_seconds"):
        raw_delay = s.get(name)
        try:
            if raw_delay is not None and float(raw_delay) < 0:
                early = True
        except (TypeError, ValueError):
            pass
    if delay_min == 0:
        shown = planned or shown  # vroeg of op tijd: geplande tijd tonen
    naam, plaats = split_name(s.get("name"))
    arr = s.get("arrival_time") if s.get("arrival_time") not in (None, "—") else ""
    dep = s.get("departure_time") if s.get("departure_time") not in (None, "—") else ""
    timeline_ms = s.get("epoch")
    if early:
        arr = s.get("planned_arrival_time") or ""
        dep = s.get("planned_departure_time") or ""
        timeline_ms = scheduled_ms or timeline_ms
    checked_arr, checked_dep = sanitize_arrival_departure(arr, dep)
    if arr and dep and not checked_arr and not checked_dep:
        # Mismatch in een bronpayload: laat geen vertrek vóór aankomst zien.
        # De geplande volledige datum/tijd is dan het betrouwbare anker.
        if scheduled_ms:
            timeline_ms = scheduled_ms
            planned = shown = hhmm(planned_at)
        elif not early and isinstance(timeline_ms, (int, float)) and timeline_ms > 0:
            planned = shown = hhmm(datetime.fromtimestamp(timeline_ms / 1000, TZ))
        elif planned:
            shown = planned
    arr, dep = checked_arr, checked_dep
    change = s.get("platform_change") or None
    sid = str(s.get("id") or "")
    return {
        "id": sid,
        "naam": naam,
        "plaats": plaats,
        "gepland": planned,
        "verwacht": shown,
        "tijd_ms": timeline_ms,
        "aankomst": arr,
        "vertrek": dep,
        "vertraging_min": delay_min,
        "live_tijd": bool(s.get("timing_live")),
        "spoor": str(s.get("track") or ""),
        "spoor_gewijzigd": {"van": str(change.get("previous") or ""), "naar": str(change.get("platform") or "")} if change else None,
        "status": {"passed": "geweest", "current": "huidig"}.get(str(s.get("state") or ""), "komt"),
        "vervalt": sid in skipped_ids,
    }


def rit_positie(stops, live, gps_age, now_ms):
    """Geef uitsluitend een live-positie terug als GPS *en* huidige halte plausibel zijn.

    OVbord kan een lusrit op dezelfde GTFS-trip leveren, met oude state=current uit
    de heenweg terwijl de bus al op de terugweg is. GPS-versheid alléén is niet genoeg.
    """
    if not stops:
        return None
    cur = next((i for i, stop in enumerate(stops) if stop["status"] == "huidig"), None)
    try:
        age = float(gps_age)
    except (ValueError, TypeError):
        age = float("inf")
    valid_age = 0 <= age <= 120
    scheduled_ms = stops[cur].get("tijd_ms") if cur is not None else None
    valid_time = isinstance(scheduled_ms, (int, float)) and abs(now_ms - scheduled_ms) <= 6 * 60_000
    if not (live and cur is not None and valid_age and valid_time):
        for stop in stops:
            stop["status"] = "geweest" if stop["tijd_ms"] and stop["tijd_ms"] < now_ms - 60_000 else "komt"
        return None

    at_stop = scheduled_ms >= now_ms - 20_000
    for i, stop in enumerate(stops):
        stop["status"] = "geweest" if i < cur or (i == cur and not at_stop) else "huidig" if i == cur else "komt"
    nxt = cur if at_stop else cur + 1
    if nxt >= len(stops):
        # Rit is voorbij: geen "Nu hier" op een verouderde eindhalte laten staan.
        for stop in stops:
            stop["status"] = "geweest"
        return None
    next_stop = stops[nxt]
    over = max(0, int(round((next_stop["tijd_ms"] - now_ms) / 60000.0))) if next_stop["tijd_ms"] else None
    return {
        "bij_halte": at_stop,
        "na_index": cur - 1 if at_stop else cur,
        "volgende_index": nxt,
        "volgende_naam": next_stop["naam"],
        "over_min": over,
        "gps_leeftijd_s": int(age),
    }


def select_boarding_segment(stops, stop_id, stop_name, departure_ms):
    """Kies de juiste passage bij lusritten; ook bij afwijkende perronhalte-ID."""
    if not departure_ms or not (stop_id or stop_name):
        return stops, False
    named = (stop_name or "").strip().casefold()
    candidates = []
    for i, stop in enumerate(stops):
        if not isinstance(stop.get("tijd_ms"), (float, int)):
            continue
        same_id = bool(stop_id) and stop["id"] == stop_id
        same_name = bool(named) and stop["naam"].casefold() == named
        if not (same_id or same_name):
            continue
        delta = abs(stop["tijd_ms"] - departure_ms)
        if delta <= 15 * 60_000:
            candidates.append((delta, 0 if same_id else 1, i))
    if not candidates:
        return stops, False
    _, _, match_idx = min(candidates)
    # Minimaal vijf vorige haltes voor context, maar geen eerste uur van de lus.
    return stops[max(0, match_idx - 5):], True


def rit(trip="", datum="", voertuig="", ritid="", instap_halte="", instap_naam="", instap_ms=0, richting=""):
    path = rit_path(trip, datum, voertuig, ritid)
    raw = CACHE.get("rit:" + path, TTL_RIT, lambda: ovbord(path))
    notices = [map_notice(n) for n in raw.get("disruptions") or []]
    skipped = {sid for n in notices if n["_skip"] for sid in n["halte_ids"]}
    stops = [map_stop(s, skipped) for s in raw.get("stops") or []]
    stops, instap_gevonden = select_boarding_segment(stops, instap_halte, instap_naam, instap_ms)
    live = bool(raw.get("live"))
    mode = str(raw.get("mode") or "bus").lower()
    try:
        delay_s = int(round(float(raw.get("delay") or 0)))
    except (TypeError, ValueError):
        delay_s = 0
    nu_hier = rit_positie(stops, live, raw.get("gps_age_seconds"), int(time.time() * 1000))
    # Een verse GPS-melding mag niet zelfstandig het label 'Live' bevestigen.
    # Geldige positie of echte live tijden uit de bron zijn hiervoor noodzakelijk.
    positie_betrouwbaar = nu_hier is not None
    live = live and (positie_betrouwbaar or any(h["live_tijd"] for h in stops))
    line = str(raw.get("line") or "").strip()
    return {
        "id": str(raw.get("journey_id") or ""),
        "lijn": short_line(line, mode),
        "lijn_naam": line,
        "modus": mode,
        "bestemming": richting if instap_gevonden and richting else str(raw.get("destination") or "Bestemming onbekend"),
        "vervoerder": carrier_name(raw.get("carrier")),
        "datum": str(raw.get("service_date") or ""),
        "live": live,
        "vertraging_min": int(round(delay_s / 60.0)) if live and delay_s >= 60 else 0,
        "vervallen": bool(raw.get("cancelled")),
        "nu_hier": nu_hier,
        "positie_betrouwbaar": positie_betrouwbaar,
        "gps_leeftijd_s": raw.get("gps_age_seconds"),
        "haltes": stops,
        "storingen": [public_notice(n) for n in notices],
        "bijgewerkt": now_iso(),
    }


# ------------------------------------------------------------ storingen ----

def storingen(ids):
    def one(stop_id):
        path = "/api/storingen/" + urllib.parse.quote(stop_id, safe="")
        return CACHE.get("storing:" + stop_id, TTL_STORING, lambda: ovbord(path))

    futures = {POOL.submit(one, sid): sid for sid in ids}
    wait(futures, timeout=6.0)
    merged = {}
    failed = 0
    for fut, sid in futures.items():
        if not fut.done() or fut.exception():
            failed += 1
            continue
        data = fut.result()
        naam, plaats = split_name(data.get("name"))
        for n in data.get("items") or []:
            m = map_notice(n)
            item = merged.setdefault(m["id"], {**public_notice(m), "haltes": []})
            label = naam if not plaats else f"{naam}, {plaats}"
            if {"id": sid, "naam": label} not in item["haltes"]:
                item["haltes"].append({"id": sid, "naam": label})
            item["lijnen"] = sorted(set(item["lijnen"]) | set(m["lijnen"]), key=lambda x: (len(x), x))
    order = {"minder": 0, "halte": 1, "omleiding": 2, "info": 3}
    items = sorted(merged.values(), key=lambda x: (order.get(x["soort"], 9), -(x["vanaf_ms"] or 0)))
    return {"bijgewerkt": now_iso(), "aantal": len(items), "storingen": items, "niet_geladen": failed, "gevraagd": len(ids), "gecontroleerd": len(ids) - failed}


# ------------------------------------------------------------ zoeken ----

def zoek(q):
    q = q.strip()
    if len(q) < 2:
        return {"query": q, "resultaten": []}
    path = "/api/search?q=" + urllib.parse.quote(q)
    raw = CACHE.get("zoek:" + q.casefold(), TTL_ZOEK, lambda: ovbord(path))
    out = []
    for r in raw.get("results") or []:
        modes = [str(m) for m in r.get("modes") or []]
        naam, plaats = split_name(r.get("name"), train="train" in modes)
        out.append({
            "id": str(r.get("id") or ""),
            "soort": str(r.get("kind") or "halte"),
            "naam": naam,
            "plaats": plaats,
            "modi": modes,
            "lijnen_aantal": r.get("line_count"),
            "lat": r.get("lat"),
            "lon": r.get("lon"),
        })
    return {"query": q, "resultaten": [x for x in out if x["id"]][:25]}


# ------------------------------------------------------------ HTTP ----

RATE = {}
RATE_LOCK = threading.Lock()
RATE_PER_MIN = 240


def rate_ok(ip):
    now = time.time()
    with RATE_LOCK:
        start, count = RATE.get(ip, (now, 0))
        if now - start >= 60:
            start, count = now, 0
        count += 1
        RATE[ip] = (start, count)
        if len(RATE) > 20000:
            for k in [k for k, v in RATE.items() if now - v[0] > 120]:
                RATE.pop(k, None)
        return count <= RATE_PER_MIN


def number(qs, name, lo, hi, default=None):
    raw = (qs.get(name) or [None])[0]
    if raw in (None, ""):
        if default is None:
            raise BadRequest(f"{name} ontbreekt")
        return default
    try:
        val = float(raw)
    except ValueError as exc:
        raise BadRequest(f"{name} is geen getal") from exc
    if not (lo <= val <= hi):
        raise BadRequest(f"{name} buiten bereik")
    return val


def text(qs, name, maxlen=120):
    val = str((qs.get(name) or [""])[0]).strip()
    if len(val) > maxlen or re.search(r"[\x00-\x1f\x7f]", val):
        raise BadRequest(f"{name} is ongeldig")
    return val


STOP_ID = re.compile(r"^[A-Za-z0-9:_.\-]{1,80}$")


def route(path, qs):
    if path == PREFIX + "/health":
        try:
            ovbord("/health", timeout=3)
            ok = True
        except Exception:
            ok = False
        return 200 if ok else 503, {"ok": ok, "versie": VERSION, "ovbord": ok, "uptime_s": int(time.time() - STARTED)}
    if path == PREFIX + "/dichtbij":
        lat = number(qs, "lat", -90, 90)
        lon = number(qs, "lon", -180, 180)
        straal = int(number(qs, "straal", 100, 5000, 1500))
        maxh = int(number(qs, "max", 1, 10, 6))
        return 200, dichtbij(lat, lon, max_haltes=maxh, straal=straal)
    if path.startswith(PREFIX + "/halte/"):
        sid = urllib.parse.unquote(path[len(PREFIX + "/halte/"):])
        if not STOP_ID.match(sid):
            raise BadRequest("halte-id is ongeldig")
        modus = text(qs, "modus", 10) or "alles"
        if modus not in ("alles", "trein", "bus"):
            raise BadRequest("modus moet alles, trein of bus zijn")
        limit = int(number(qs, "max", 1, 60, 30))
        return 200, halte(sid, modus, limit)
    if path == PREFIX + "/rit":
        instap_halte = text(qs, "instap_halte", 80)
        if instap_halte and not STOP_ID.match(instap_halte):
            raise BadRequest("instap_halte is ongeldig")
        instap_ms = int(number(qs, "instap_ms", 0, 10_000_000_000_000, 0))
        return 200, rit(text(qs, "trip"), text(qs, "datum", 10), text(qs, "voertuig"), text(qs, "id"),
                        instap_halte, text(qs, "instap_naam", 120), instap_ms, text(qs, "richting", 120))
    if path == PREFIX + "/storingen":
        ids = [x for x in text(qs, "haltes", 2000).split(",") if x.strip()]
        ids = list(dict.fromkeys(x.strip() for x in ids))[:30]
        if any(not STOP_ID.match(x) for x in ids):
            raise BadRequest("haltes bevat een ongeldige id")
        if not ids:
            return 200, {"bijgewerkt": now_iso(), "aantal": 0, "storingen": [], "niet_geladen": 0}
        return 200, storingen(ids)
    if path == PREFIX + "/zoek":
        return 200, zoek(text(qs, "q", 80))
    raise NotFound("Onbekend endpoint")


class Handler(BaseHTTPRequestHandler):
    server_version = "ovspot-app-api/" + VERSION
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # alleen fouten loggen (journal), geen IP-adressen
        pass

    def _send(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        etag = '"' + hashlib.blake2b(body, digest_size=10).hexdigest() + '"'
        inm = self.headers.get("If-None-Match") or ""
        if status == 200 and etag in [x.strip().removeprefix("W/") for x in inm.split(",")]:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        gz = "gzip" in (self.headers.get("Accept-Encoding") or "") and len(body) > 900
        if gz:
            body = gzip.compress(body, compresslevel=5)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("ETag", etag)
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("Access-Control-Allow-Origin", "*")
        if gz:
            self.send_header("Content-Encoding", "gzip")
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        ip = self.headers.get("X-Real-IP") or self.client_address[0]
        if not rate_ok(ip):
            self._send(429, {"ok": False, "fout": "Te veel verzoeken, probeer het zo opnieuw"}, {"Retry-After": "30"})
            return
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = urllib.parse.parse_qs(parsed.query, keep_blank_values=False)
        try:
            status, payload = route(path, qs)
            if isinstance(payload, dict) and "ok" not in payload:
                payload = {"ok": True, **payload}
            self._send(status, payload)
        except BadRequest as exc:
            self._send(400, {"ok": False, "fout": str(exc)})
        except NotFound as exc:
            self._send(404, {"ok": False, "fout": str(exc)})
        except Upstream:
            self._send(502, {"ok": False, "fout": "Gegevens tijdelijk niet beschikbaar"})
        except Exception as exc:  # pragma: no cover
            print(f"FOUT {path}: {type(exc).__name__}: {exc}", flush=True)
            self._send(500, {"ok": False, "fout": "Interne fout"})


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 256


def main():
    srv = Server((HOST, PORT), Handler)
    print(f"ovspot-app-api {VERSION} luistert op {HOST}:{PORT}, OVbord={OVBORD}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
