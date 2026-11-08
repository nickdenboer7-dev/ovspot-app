"""
OVspot-app API v2 — KV8-ritendpoint.

    GET /app/v2/kv8/rit/<vervoerder>/<lijn>/<rit>?dag=YYYY-MM-DD&versterking=0
    GET /app/v2/kv8/rit/<trip_id>?dag=YYYY-MM-DD
    GET /app/v2/rit?trip=<gtfs_trip_id>&datum=YYYY-MM-DD  (v1-compatibele JSON)
        trip_id = realtime_trip_id ('RET:35:613001') of GTFS trip_id ('382997176', opgezocht in gtfs.db).
        Beide vormen gebruiken dezelfde interne handler.

Stroom per verzoek:
  1. Rauwe rijen van één rit uit SQLite (kv8.db van ovspot-app-kv8, alleen-lezen).
  2. Elke rij → kv8_normalisatie.normaliseer()     (schone tijden, aankomst nooit na vertrek)
  3. Lijst      → kv8_normalisatie.ritverloop_haltes() (ook PASSED als historie)
  4. Per halte  + vertraging_s, live, vervallen → JSON.
  5. /app/v2/rit koppelt de passage via GTFS stop_sequence aan de v1-veldnamen.

Alleen standaardbibliotheek. Shadow-modus: luistert op 127.0.0.1:8112, niet publiek.
"""
import json
import os
import re
import sqlite3
import threading
import time
import urllib.parse
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from kv8_normalisatie import TZ, normaliseer, ritverloop_haltes

VERSION = "2.0.19-static-haltelijnen"
KV8_DB = os.environ.get("OVSPOT_KV8_DB", "/var/lib/ovspot-app-kv8/kv8.db")
GTFS_DB = os.environ.get("OVSPOT_GTFS_DB", "/home/ubuntu/kv15-bot/gtfs.db")
HOST = os.environ.get("OVSPOT_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("OVSPOT_API_PORT", "8112"))
PREFIX = "/app/v2"

LIVE_STATUS = frozenset({"DRIVING", "ARRIVED"})
LIVE_MAX_S = 180          # rit telt alleen als live als er < 3 min geleden nog KV8 voor binnenkwam
NACHT_TOT_UUR = 5         # vóór 05:00 hoort een rit zonder ?dag= vaak nog bij de dienstdag van gisteren

_RE_VERVOERDER = re.compile(r"^[A-Z]{2,10}$")
_RE_CODE = re.compile(r"^[A-Za-z0-9_\-]{1,16}$")
_RE_DAG = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_RE_TRIP = re.compile(r"^[A-Za-z0-9_\-]{1,32}(:[A-Za-z0-9_\-]{1,32}){0,2}$")

SQL_RIT = """
SELECT operator, operation_date, line, journey, stop_order, quay, userstop, status,
       target_arr, target_dep, expected_arr, expected_dep, cancelled, received_ts
FROM passages
WHERE operator=? AND operation_date=? AND line=? AND journey=? AND fortify=?
ORDER BY stop_order
"""


class BadRequest(Exception):
    pass


class NotFound(Exception):
    pass


# ------------------------------------------------------------------ database ----
_lokaal = threading.local()


def db():
    """Eén alleen-lezen verbinding per thread (sqlite3-verbindingen mogen niet tussen threads gedeeld worden)."""
    con = getattr(_lokaal, "con", None)
    if con is None:
        con = sqlite3.connect(f"file:{KV8_DB}?mode=ro", uri=True, timeout=2.0, check_same_thread=True)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA query_only=1")
        _lokaal.con = con
    return con


def _gtfs_handtekening():
    try:
        st = os.stat(GTFS_DB)
        return st.st_ino, st.st_mtime_ns
    except OSError:
        return None


def gtfs_db():
    """
    Alleen-lezen verbinding met de dienstregeling (voor GTFS trip_id → realtime_trip_id).
    gtfs.db wordt 's nachts atomisch vervangen (os.replace); een open verbinding blijft dan het oude
    bestand lezen. Daarom: bij een andere inode/mtime opnieuw openen.
    """
    handtekening = _gtfs_handtekening()
    con = getattr(_lokaal, "gtfs", None)
    if con is not None and handtekening is not None and handtekening != getattr(_lokaal, "gtfs_sig", None):
        con.close()
        con = None
    if con is None:
        con = sqlite3.connect(f"file:{GTFS_DB}?mode=ro", uri=True, timeout=2.0)
        con.execute("PRAGMA query_only=1")
        _lokaal.gtfs, _lokaal.gtfs_sig = con, handtekening
    return con


def db_naar_kv8(r: sqlite3.Row) -> dict:
    """Databaserij → dict met KV8-veldnamen, precies wat normaliseer() verwacht."""
    return {
        "DataOwnerCode": r["operator"],
        "OperationDate": r["operation_date"],
        "LinePlanningNumber": r["line"],
        "JourneyNumber": r["journey"],
        "UserStopOrderNumber": r["stop_order"],
        "UserStopCode": r["userstop"],
        "QuayCode": r["quay"],
        "TripStopStatus": r["status"],
        "TargetArrivalTime": r["target_arr"],
        "TargetDepartureTime": r["target_dep"],
        "ExpectedArrivalTime": r["expected_arr"],
        "ExpectedDepartureTime": r["expected_dep"],
    }


# -------------------------------------------------------------------- logica ----
def _vertraging_s(h: dict) -> int:
    """Vertrek als basis, op de eindhalte aankomst. Nooit negatief (OVspot toont geen vroege tijden)."""
    if h["gepland_vertrek"] is not None and h["live_vertrek"] is not None:
        verschil = h["live_vertrek"] - h["gepland_vertrek"]
    elif h["gepland_aankomst"] is not None and h["live_aankomst"] is not None:
        verschil = h["live_aankomst"] - h["gepland_aankomst"]
    else:
        return 0
    return max(0, verschil // 1000)


def kv8_rit(con, vervoerder, dag, lijn, rit, versterking="0", nu=None):
    nu = time.time() if nu is None else nu
    rauw = con.execute(SQL_RIT, (vervoerder, dag, lijn, rit, versterking)).fetchall()
    if not rauw:
        return None

    nieuwste = max(r["received_ts"] for r in rauw)
    rit_vers = nu - nieuwste <= LIVE_MAX_S

    extra = {}          # volgorde → info uit de rauwe rij die normaliseer() niet teruggeeft
    genormaliseerd = []
    for r in rauw:
        h = normaliseer(db_naar_kv8(r))                                   # stap 2
        if h is None:
            continue
        genormaliseerd.append(h)
        extra[h["volgorde"]] = (
            r["expected_arr"] is not None or r["expected_dep"] is not None,
            bool(r["cancelled"]),
        )

    haltes = []
    for h in ritverloop_haltes(genormaliseerd):                              # stap 3
        heeft_verwachting, vervallen = extra[h["volgorde"]]
        live = rit_vers and h["status"] in LIVE_STATUS and heeft_verwachting
        haltes.append({                                                   # stap 4
            "volgorde": h["volgorde"],
            "halte": h["halte"],
            "status": h["status"],
            "gepland_aankomst": h["gepland_aankomst"],
            "live_aankomst": h["live_aankomst"],
            "gepland_vertrek": h["gepland_vertrek"],
            "live_vertrek": h["live_vertrek"],
            "vertraging_s": _vertraging_s(h) if live else 0,
            "live": live,
            "vervallen": vervallen,
        })

    return {
        "rit": {"vervoerder": vervoerder, "lijn": lijn, "rit": rit, "dag": dag, "versterking": versterking},
        "bijgewerkt_ms": int(nieuwste * 1000),
        "live": rit_vers and any(h["live"] for h in haltes),
        "haltes": haltes,
    }


def _dagen(dag_param, nu=None):
    if dag_param:
        if not _RE_DAG.match(dag_param):
            raise BadRequest("dag moet JJJJ-MM-DD zijn")
        return [dag_param]
    nu = datetime.now(TZ) if nu is None else nu
    vandaag = nu.date().isoformat()
    if nu.hour < NACHT_TOT_UUR:
        return [vandaag, (nu.date() - timedelta(days=1)).isoformat()]
    return [vandaag]


def kv8_sleutel(trip, gtfs=None):
    """
    Rit-aanduiding → (vervoerder, lijn, rit).
      'RET:35:613001'  realtime_trip_id, direct gesplitst
      '382997176'      GTFS trip_id, via trips.realtime_trip_id in gtfs.db
    """
    if not _RE_TRIP.match(trip):
        raise BadRequest("ongeldige trip-id")
    if ":" not in trip:
        rij = (gtfs or gtfs_db()).execute("SELECT realtime_trip_id FROM trips WHERE trip_id=?", (trip,)).fetchone()
        if not rij or not rij[0]:
            raise NotFound("Onbekende trip-id")
        trip = rij[0]
    delen = trip.split(":")
    if len(delen) != 3:
        raise NotFound("Geen KV8-rit voor deze trip-id")
    return delen[0].upper(), delen[1], delen[2]


def _rit_antwoord(con, vervoerder, lijn, rit, qs):
    """Gedeelde handler voor beide URL-vormen."""
    versterking = (qs.get("versterking") or ["0"])[0]
    if not _RE_VERVOERDER.match(vervoerder) or not _RE_CODE.match(lijn) or not _RE_CODE.match(rit) \
            or not versterking.isdigit():
        raise BadRequest("ongeldige vervoerder, lijn, rit of versterking")
    con = con or db()
    for dag in _dagen((qs.get("dag") or [None])[0]):
        antwoord = kv8_rit(con, vervoerder, dag, lijn, rit, versterking)
        if antwoord:
            return 200, antwoord
    raise NotFound("Geen KV8-gegevens voor deze rit")


def _app_rit_antwoord(qs, con=None, gtfs=None):
    """v1-compatibele JSON op /app/v2/rit?trip=...&datum=..., nog niet gekoppeld aan de app."""
    datum = (qs.get("datum") or [""])[0]
    trip = (qs.get("trip") or [""])[0]
    voertuig = (qs.get("voertuig") or qs.get("id") or [""])[0]
    if not datum and voertuig and not trip:
        datum = _dagen(None)[0]  # v1 accepteert ook een voertuig zonder expliciete datum.
    if not _RE_DAG.fullmatch(datum):
        raise BadRequest("datum ontbreekt of is ongeldig (JJJJ-MM-DD)")
    try:
        datetime.strptime(datum, "%Y-%m-%d")
    except ValueError as exc:
        raise BadRequest("datum is ongeldig") from exc
    g = gtfs if gtfs is not None else gtfs_db()
    if not trip and voertuig:
        if not _RE_TRIP.fullmatch(voertuig):
            raise BadRequest("ongeldige voertuig-id")
        kandidaten = g.execute(
            "SELECT trip_id FROM trips WHERE realtime_trip_id=? LIMIT 2", (voertuig,)
        ).fetchall()
        if len(kandidaten) == 1:
            trip = kandidaten[0][0]
        elif voertuig.count(":")==2:
            # NDOV-ritnummer kan meerdere service-dagen delen. Vind exact
            # één actieve GTFS-rit op de datum van de aangeklikte passage.
            dag_kandidaten=g.execute(
                "SELECT DISTINCT t.trip_id FROM trips t "
                "JOIN calendar_dates cd ON cd.service_id=t.service_id "
                "WHERE t.realtime_trip_id=? AND cd.date=? AND cd.exception_type=1 LIMIT 2",
                (voertuig,datum.replace("-","")),
            ).fetchall()
            if len(dag_kandidaten)!=1:
                raise NotFound("NDOV-ritnummer op deze datum niet eenduidig")
            trip=dag_kandidaten[0][0]
        elif "_" in voertuig:
            # Een voertuig-ID is niet een rit-ID. Alleen met unieke verse KV8-
            # passage én GTFS-stopvolgorde/dienstregeling mag dit doorverwijzen.
            from rit_voertuig_v2 import unique_bus_trip
            trip=unique_bus_trip(voertuig,datum,g,con if con is not None else db())
            if not trip:
                raise NotFound("Geen eenduidige recente KV8-rit voor voertuig")
        elif voertuig.isdigit() or (voertuig.startswith("IFF:") and voertuig.rsplit(":",1)[-1].isdigit()):
            # Dezelfde treinnummers zijn over meerdere GTFS-ritten mogelijk.
            # Alleen bij één unieke station/tijd-match wordt een treinrit gekozen.
            from trein_compat import trip_voor_treinnummer
            nummer=voertuig.rsplit(":",1)[-1]
            trip=trip_voor_treinnummer(g,nummer,datum)
            if not trip:
                # Wanneer er géén uniek GTFS-trip-ID te verifiëren is, kan
                # een unieke, verse InfoPlus-rit zijn eigen echte stationsreeks
                # teruggeven. Geen fictieve GTFS-rit of halte-ID invoegen.
                from trein_voertuig_v2 import bouw_voertuig_rit
                rail=bouw_voertuig_rit(nummer,datum,g)
                if rail is not None:
                    return 200,rail
                raise NotFound("Geen eenduidige actuele treinrit voor voertuig")
        else:
            raise NotFound("Geen unieke GTFS-rit voor voertuig")
    if not trip:
        raise BadRequest("trip+datum of voertuig is nodig")
    if not _RE_TRIP.fullmatch(str(trip)):
        raise BadRequest("ongeldige trip-id")
    soort=g.execute(
        "SELECT r.route_type FROM trips t JOIN routes r ON r.route_id=t.route_id WHERE t.trip_id=?",
        (str(trip),)
    ).fetchone()
    if soort and soort[0]==2:
        from trein_compat import bouw_trein_rit
        antwoord=bouw_trein_rit(str(trip),datum,g)
        if antwoord is None:
            raise NotFound("Geen treinrit op deze GTFS-dienstdag")
        from board_v2 import rit_kaart_geometrie
        antwoord.update(rit_kaart_geometrie(g,str(trip)))
        return 200, antwoord
    from rit_compat import bouw_rit
    antwoord = bouw_rit(
        str(trip), datum, con if con is not None else db(), g, kv8_rit, kv8_sleutel
    )
    if antwoord is None:
        raise NotFound("Geen bus-, tram- of metrorit met GTFS-data")
    from board_v2 import rit_kaart_geometrie
    antwoord.update(rit_kaart_geometrie(g,str(trip)))
    return 200, antwoord


def _number(qs, name, lo, hi, default=None):
    import math
    raw = (qs.get(name) or [None])[0]
    if raw is None:
        if default is None:
            raise BadRequest(f"{name} ontbreekt")
        return default
    try:
        val = float(raw)
    except (ValueError, TypeError) as exc:
        raise BadRequest(f"{name} is geen getal") from exc
    if not (math.isfinite(val) and lo <= val <= hi):
        raise BadRequest(f"{name} buiten bereik")
    return val


def _app_halte_antwoord(stop, qs, con=None, gtfs=None):
    if not re.fullmatch(r"[A-Za-z0-9:_.\\-]{1,80}", stop):
        raise BadRequest("halte-id is ongeldig")
    modus = (qs.get("modus") or ["alles"])[0]
    if modus not in ("alles", "trein", "bus"):
        raise BadRequest("modus moet alles, trein of bus zijn")
    limit = int(_number(qs, "max", 1, 60, 30))
    from board_v2 import halte
    out = halte(stop, modus, limit, gtfs if gtfs is not None else gtfs_db(),
                con if con is not None else db())
    if out is None:
        raise NotFound("Halte niet gevonden")
    return 200, out


def _app_vertrektijden_antwoord(qs, con=None, gtfs=None):
    """350m multimodaal vertrekbord met automatische eerstvolgende-10 fallback."""
    stop_id = str(next((
        (qs.get(name) or [""])[0]
        for name in ("halte_id", "stop_id", "id") if (qs.get(name) or [""])[0]
    ), "")).strip()
    if stop_id and not re.fullmatch(r"[A-Za-z0-9:_.\-]{1,80}", stop_id):
        raise BadRequest("halte_id is ongeldig")
    if not stop_id:
        lat = _number(qs,"lat",-90,90)
        lon = _number(qs,"lon",-180,180)
    else:
        lat = lon = None
    limit = int(_number(qs,"max",1,60,30))
    from board_v2 import vertrektijden
    result = vertrektijden(
        gtfs if gtfs is not None else gtfs_db(),
        con if con is not None else db(),
        stop_id=stop_id or None,lat=lat,lon=lon,limit=limit
    )
    if result is None:
        raise NotFound("Halte niet gevonden of coördinaten ontbreken")
    return 200,result


def _app_dichtbij_antwoord(qs, con=None, gtfs=None):
    lat = _number(qs, "lat", -90, 90)
    lon = _number(qs, "lon", -180, 180)
    # Nieuwe Android-app stuurt radius expliciet mee. Oudere clients
    # blijven werken via straal en dezelfde standaardstraal (1500m).
    # 'afstand' is een compatibele alias voor handmatige URL-aanroepen.
    radius_param = next((key for key in ("radius", "afstand", "straal")
                         if (qs.get(key) or [None])[0] not in (None, "")), "straal")
    straal = int(_number(qs, radius_param, 100, 5000, 1500))
    # De eerdere max=8 van de app beperkte het zicht tot de eerste 800m,
    # zelfs bij een straal van 3km. Nu kan de app verdere haltes in
    # pagina's ophalen, zonder een enorm of trager eerste antwoord.
    default_max = 40 if radius_param in ("radius", "afstand") else 6
    max_haltes = int(_number(qs, "max", 1, 80, default_max))
    offset = int(_number(qs, "offset", 0, 10000, 0))
    from board_v2 import dichtbij
    return 200, dichtbij(lat, lon, straal, max_haltes,
                         gtfs if gtfs is not None else gtfs_db(),
                         con if con is not None else db(), offset=offset)


def _app_zoek_antwoord(qs, gtfs=None):
    query = (qs.get("q") or [""])[0].strip()
    if len(query) > 80:
        raise BadRequest("Zoekopdracht is te lang")
    from zoeken_v2 import zoek
    # Opt-in: bestaande Android-v1/API-v2-clients behouden exact hetzelfde
    # zoekcontract; Wayfinding V2 vraagt lijncatalogus expliciet op.
    include_lijnen = (qs.get("lijnen") or ["0"])[0] == "1"
    return 200, zoek(query, gtfs if gtfs is not None else gtfs_db(),
                     include_lijnen=include_lijnen)


def _app_storingen_antwoord(qs, gtfs=None):
    raw=str((qs.get("haltes") or [""])[0]).strip()
    if len(raw)>2000 or re.search(r"[\x00-\x1f\x7f]",raw):
        raise BadRequest("haltes is ongeldig")
    ids=list(dict.fromkeys(x.strip() for x in raw.split(",") if x.strip()))[:30]
    if any(not re.fullmatch(r"[A-Za-z0-9:_.\-]{1,80}",x) for x in ids):
        raise BadRequest("haltes bevat een ongeldige id")
    from storingen_v2 import storingen
    return 200, storingen(ids,gtfs if gtfs is not None else gtfs_db())


def route(path, qs, con=None, gtfs=None):
    deel = path[len(PREFIX):].strip("/").split("/") if path.startswith(PREFIX + "/") else []
    deel = [urllib.parse.unquote(d) for d in deel]
    if deel == ["health"]:
        return 200, {"versie": VERSION}
    if deel == ["voertuigen"]:
        from voertuigen_v2 import zoek_voertuigen
        try:
            return 200, zoek_voertuigen(qs)
        except ValueError as exc:
            raise BadRequest(str(exc)) from exc
    if deel == ["voertuig"]:
        from voertuigen_v2 import voertuig_bij_rit
        try:
            return 200, voertuig_bij_rit(qs, gtfs if gtfs is not None else gtfs_db())
        except ValueError as exc:
            raise BadRequest(str(exc)) from exc
    if deel == ["rit"]:
        return _app_rit_antwoord(qs, con, gtfs)
    if deel == ["storingen"]:
        return _app_storingen_antwoord(qs, gtfs)
    if deel == ["zoek"]:
        return _app_zoek_antwoord(qs, gtfs)
    if deel == ["vertrektijden"]:
        return _app_vertrektijden_antwoord(qs, con, gtfs)
    if deel == ["dichtbij"]:
        return _app_dichtbij_antwoord(qs, con, gtfs)
    if len(deel) == 2 and deel[0] == "halte":
        return _app_halte_antwoord(deel[1], qs, con, gtfs)
    if deel[:2] == ["kv8", "rit"]:
        if len(deel) == 5:                                   # /kv8/rit/<vervoerder>/<lijn>/<rit>
            return _rit_antwoord(con, deel[2].upper(), deel[3], deel[4], qs)
        if len(deel) == 3:                                   # /kv8/rit/<trip_id>
            vervoerder, lijn, rit = kv8_sleutel(deel[2], gtfs)
            return _rit_antwoord(con, vervoerder, lijn, rit, qs)
    raise NotFound("Onbekend adres")


# ---------------------------------------------------------------------- http ----
class Handler(BaseHTTPRequestHandler):
    server_version = "ovspot-app-api/" + VERSION
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        try:
            status, payload = route(parsed.path.rstrip("/"), urllib.parse.parse_qs(parsed.query))
            self._send(status, {"ok": True, **payload})
        except BadRequest as exc:
            self._send(400, {"ok": False, "fout": str(exc)})
        except NotFound as exc:
            self._send(404, {"ok": False, "fout": str(exc)})
        except sqlite3.OperationalError as exc:
            print(f"DB-FOUT: {exc}", flush=True)
            self._send(503, {"ok": False, "fout": "Gegevens tijdelijk niet beschikbaar"})
        except Exception as exc:  # pragma: no cover
            print(f"FOUT {parsed.path}: {type(exc).__name__}: {exc}", flush=True)
            self._send(500, {"ok": False, "fout": "Interne fout"})


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 256


def main():
    print(f"ovspot-app-api {VERSION} op {HOST}:{PORT}{PREFIX} (KV8: {KV8_DB})", flush=True)
    Server((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
