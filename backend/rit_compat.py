"""OVspot v2 rit-overzicht met exact de *veldnamen/types* van de v1-ritrespons.

Alle ritpassages worden aan GTFS stop_sequence gekoppeld, nooit aan naam of halte-id.
Dit is een schaduwroute: geen OVbord-verzoeken, geen v1-wijzigingen.
"""
import time
from datetime import datetime
from kv8_normalisatie import TZ, tijd_ms
from volledige_namen_v2 import volledige_haltenaam, plaats_van_halte, volledige_bestemming

CARRIERS = {
    "QBUZZ": "Qbuzz", "ARR": "Arriva", "ARRIVA": "Arriva",
    "CXX": "Connexxion", "EBS": "EBS", "GVB": "GVB",
    "HTM": "HTM", "RET": "RET", "KEOLIS": "Keolis",
    "SYNTUS": "Keolis", "OVERAL": "Keolis", "UOV": "U-OV",
    "NS": "NS", "BLAUWNET": "Blauwnet", "RRREIS": "RRReis",
}

def _name(full):
    # Geen verkorte halte-displaynaam: gebruik de gehele SQL stop_name.
    return volledige_haltenaam(full), plaats_van_halte(full)

def _mode(route_type):
    if route_type == 0:
        return "tram"
    if route_type == 1:
        return "metro"
    if route_type == 2:
        return "train"
    return "bus"

def _line(line, mode):
    line = str(line or "").strip()
    if mode != "train" and len(line) > 6:
        return line.split()[0][:6]
    return line or ("Trein" if mode == "train" else "Bus")

def _hhmm(ms):
    return datetime.fromtimestamp(ms / 1000, TZ).strftime("%H:%M") if ms is not None else ""

def _now_iso(now):
    return datetime.fromtimestamp(now, TZ).isoformat(timespec="seconds")

def _verwachte_tijd(planned, effective, carry_delay_ms):
    """Volgende haltes erven de laatste delay totdat een EIGEN update die wijzigt.

    Geen extra query, geen cache, geen opwarming of wijziging van KV8-records.
    """
    if planned is None:
        return effective, carry_delay_ms
    if effective is not None:
        carry_delay_ms=max(0,int(effective-planned))
        return max(planned,effective), carry_delay_ms
    return planned+carry_delay_ms, carry_delay_ms


def bouw_rit(trip, datum, kv8_con, gtfs_con, kv8_rit, kv8_sleutel, nu=None):
    """Lever v1-vorm; KV8 en GTFS uitsluitend lezen. Rit kan ook zonder actuele KV8 worden getoond."""
    now = time.time() if nu is None else nu
    meta = gtfs_con.execute(
        """SELECT t.destination, r.line, r.agency_id, r.route_type
           FROM trips t LEFT JOIN routes r ON r.route_id=t.route_id
           WHERE t.trip_id=?""", (trip,)
    ).fetchone()
    if meta is None:
        return None
    destination, route_line, agency_id, route_type = meta
    mode = _mode(route_type)
    if mode == "train":
        # Trein-NS-verrijking hoort bij een latere stap; geen KV8-bus als trein tonen.
        return None
    try:
        operator, line_key, journey = kv8_sleutel(trip, gtfs_con)
    except Exception as exc:
        # Onbekende KV8-sleutel: geen foutieve koppeling maken, ook niet bij trein-id.
        if type(exc).__name__ in {"NotFound", "BadRequest"}:
            return None
        raise

    times = gtfs_con.execute(
        """SELECT st.stop_sequence, st.stop_id, st.arrival_time, st.departure_time,
                  s.stop_name, s.platform_code
           FROM stop_times st LEFT JOIN stops s ON s.stop_id=st.stop_id
           WHERE st.trip_id=? ORDER BY st.stop_sequence""", (trip,)
    ).fetchall()
    if not times:
        return None
    # Geen identificatie op naam: dezelfde halte op volgorde 2 en 9 is twee bezoeken.
    sequences = [int(t[0]) for t in times]
    if len(sequences) != len(set(sequences)):
        return None   # Ongeldige GTFS-passages; geen willekeurige koppeling.

    raw = kv8_rit(kv8_con, operator, datum, line_key, journey, nu=now)
    kv_by_seq = {int(h["volgorde"]): h for h in (raw or {}).get("haltes", [])}
    recorded = {
        int(seq): (arr, dep, bool(cancelled))
        for seq, arr, dep, cancelled in kv8_con.execute(
            """SELECT stop_order, recorded_arr, recorded_dep, cancelled FROM passages
               WHERE operator=? AND operation_date=? AND line=? AND journey=? AND fortify='0'""",
            (operator, datum, line_key, journey),
        )
    }

    live = bool(raw and raw["live"])
    passed = [seq for seq, h in kv_by_seq.items() if h["status"] == "PASSED"]
    arrived = [seq for seq, h in kv_by_seq.items() if h["status"] == "ARRIVED"]
    last_passed = max(passed, default=None)
    current = max(arrived, default=None) if live else None
    if current is not None and last_passed is not None and current <= last_passed:
        current = None
    progress = max(x for x in (last_passed, current) if x is not None) if (last_passed is not None or current is not None) else None

    stops = []
    carry_delay_ms = 0
    for seq, stop_id, arr, dep, stop_name, platform in times:
        seq = int(seq)
        h = kv_by_seq.get(seq)
        arr_ms = tijd_ms(datum, arr)
        dep_ms = tijd_ms(datum, dep)
        planned = dep_ms if dep_ms is not None else arr_ms
        rarr, rdep, cancelled = recorded.get(seq, (None, None, False))
        actual = tijd_ms(datum, rdep or rarr) if h and h["status"] == "PASSED" else None
        predicted = (h["live_vertrek"] or h["live_aankomst"]) if h and h["live"] else None
        effective = actual if actual is not None else predicted
        # Een live- of recorded-melding overschrijft de delay; ontbrekende eigen
        # update neemt de laatste delay mee, ook naar toekomstige haltes.
        shown, carry_delay_ms = _verwachte_tijd(planned, effective, carry_delay_ms)
        observed_arr = tijd_ms(datum, rarr) if h and h["status"] == "PASSED" else None
        predicted_arr = h["live_aankomst"] if h and h["live"] else None
        effective_arr = observed_arr if observed_arr is not None else predicted_arr
        shown_arr = max(arr_ms, effective_arr) if arr_ms is not None and effective_arr is not None else (
            arr_ms + carry_delay_ms if arr_ms is not None else effective_arr
        )
        delta = max(0, round((shown - planned) / 60000)) if shown is not None and planned is not None else 0
        name, city = _name(stop_name)
        if h and h["status"] == "PASSED":
            status = "geweest"
        elif progress is not None and seq < progress:
            status = "geweest"
        elif current is not None and seq == current:
            status = "huidig"
        elif progress is None and planned is not None and planned < now * 1000 - 60000:
            status = "geweest"  # v1-fallback bij ontbrekende actuele positie.
        else:
            status = "komt"
        stops.append({
            "id": str(stop_id or ""), "naam": name, "plaats": city,
            "gepland": _hhmm(planned), "verwacht": _hhmm(shown),
            "tijd_ms": shown, "aankomst": _hhmm(shown_arr), "vertrek": _hhmm(shown if dep_ms is not None else shown_arr),
            "vertraging_min": delta, "live_tijd": bool(effective is not None),
            "spoor": str(platform or ""), "spoor_gewijzigd": None,
            "status": status, "vervalt": bool(cancelled or (h and h["vervallen"])),
        })
    nu_hier = None
    if live and progress is not None and progress in sequences:
        idx = sequences.index(progress)
        at_stop = current == progress
        next_idx = idx if at_stop else idx + 1
        if next_idx < len(stops):
            next_stop = stops[next_idx]
            next_time = next_stop["tijd_ms"]
            nu_hier = {
                "bij_halte": at_stop,
                "na_index": idx - 1 if at_stop else idx,
                "volgende_index": next_idx,
                "volgende_naam": next_stop["naam"],
                "over_min": max(0, round((next_time - now * 1000) / 60000)) if next_time is not None else None,
                "gps_leeftijd_s": None,   # KV8 geeft geen GPS-leeftijd: niet verzinnen.
            }
    return {
        "id": "gtfs/" + str(trip),
        "lijn": _line(route_line or line_key, mode),
        "lijn_naam": str(route_line or line_key),
        "modus": mode,
        "bestemming": volledige_bestemming(gtfs_con, trip, destination),
        "vervoerder": CARRIERS.get(str(agency_id or "").upper(), CARRIERS.get(operator, operator)),
        "datum": datum,
        "live": live,
        "vertraging_min": max(0, round(carry_delay_ms / 60000)) if live else 0,
        "vervallen": False,
        "nu_hier": nu_hier,
        "haltes": stops,
        "storingen": [],  # Inhoud van KV15/GVB volgt bij het storingen-endpoint.
        "bijgewerkt": _now_iso(now),
    }
