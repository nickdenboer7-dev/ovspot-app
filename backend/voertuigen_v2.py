"""Alleen-lezen actuele NDOV voertuigposities voor /app/v2/voertuigen."""
import math
import os
import re
import sqlite3
import time
from datetime import date

DB = os.environ.get("OVSPOT_VOERTUIGEN_DB", "/var/lib/ovspot-live-mapper/live_voertuigen.db")
LIVE_SECONDS = 180


def _number(raw, name, lo, hi):
    try:
        val = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} is geen getal") from exc
    if not math.isfinite(val) or not lo <= val <= hi:
        raise ValueError(f"{name} buiten bereik")
    return val


def zoek_voertuigen(qs, now=None, db_path=None):
    """Geen live-data-fictie: alleen voertuigen met posities van max 3 minuten oud."""
    now = int(time.time() if now is None else now)
    db_path = DB if db_path is None else db_path
    line = (qs.get("lijnnummer") or qs.get("lijn") or [""])[0].strip()
    if len(line) > 36 or (line and not re.fullmatch(r"[\w.\- /]{1,36}", line)):
        raise ValueError("ongeldig lijnnummer")
    raw_limit = (qs.get("max") or ["500"])[0]
    max_items = int(_number(raw_limit, "max", 1, 1000))
    raw_bbox = (qs.get("bbox") or [""])[0].strip()
    query = ("SELECT voertuignummer,lijnnummer,lat,lon,timestamp,richting "
             "FROM voertuigen WHERE timestamp >= ? AND timestamp <= ?")
    params = [now - LIVE_SECONDS, now + 120]
    if line:
        query += " AND lijnnummer = ?"
        params.append(line)
    if raw_bbox:
        coords = raw_bbox.split(",")
        if len(coords) != 4:
            raise ValueError("bbox vereist minLon,minLat,maxLon,maxLat")
        west = _number(coords[0], "minLon", -180, 180)
        south = _number(coords[1], "minLat", -90, 90)
        east = _number(coords[2], "maxLon", -180, 180)
        north = _number(coords[3], "maxLat", -90, 90)
        if west >= east or south >= north:
            raise ValueError("bbox is ongeldig")
        query += " AND lon BETWEEN ? AND ? AND lat BETWEEN ? AND ?"
        params.extend((west, east, south, north))
    query += " ORDER BY timestamp DESC, voertuignummer LIMIT ?"
    params.append(max_items)
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=2.0) as con:
        con.execute("PRAGMA query_only=ON")
        rows = con.execute(query, params).fetchall()
    return {
        "bron": "NDOV KV6posinfo",
        "tijdstip": now,
        "max_leeftijd_s": LIVE_SECONDS,
        "aantal": len(rows),
        "voertuigen": [
            {"voertuignummer": str(vid), "lijnnummer": str(line_no),
             "lat": round(float(lat), 6), "lon": round(float(lon), 6),
             "timestamp": int(ts), "leeftijd_s": max(0, now - int(ts)),
             "richting": float(heading) if heading is not None else None}
            for vid, line_no, lat, lon, ts, heading in rows
        ],
    }



def voertuig_bij_rit(qs, gtfs, now=None, db_path=None):
    """Eén live voertuig voor een exacte GTFS-rit en dienstendatum, of geen kaart.

    Nooit zomaar een voertuig van dezelfde lijn pakken: route-trip-ID,
    exploitant, lijn, ritnummer, dienstendatum en versterking 0 moeten matchen.
    """
    now = int(time.time() if now is None else now)
    db_path = DB if db_path is None else db_path
    raw = str((qs.get("rit_id") or [""])[0]).strip()
    rit_id = raw[5:] if raw.startswith("gtfs/") else raw
    if not re.fullmatch(r"[A-Za-z0-9_:\-]{1,80}", rit_id):
        raise ValueError("rit_id ontbreekt of is ongeldig")
    datum = str((qs.get("datum") or [""])[0]).strip()
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", datum):
            raise ValueError("datum ontbreekt of is ongeldig")
        date.fromisoformat(datum)
    except ValueError as exc:
        raise ValueError("datum ontbreekt of is ongeldig") from exc

    empty = {
        "bron": "NDOV KV6posinfo", "rit_id": raw, "datum": datum,
        "tijdstip": now, "beschikbaar": False, "voertuig": None,
    }
    meta = gtfs.execute(
        "SELECT t.realtime_trip_id,r.route_type FROM trips t "
        "JOIN routes r ON r.route_id=t.route_id WHERE t.trip_id=?",
        (rit_id,)
    ).fetchone()
    if not meta or meta[1] not in (0, 1, 3, 4) or not meta[0]:
        return empty
    key = str(meta[0]).split(":")
    if len(key) != 3:
        return empty
    operator, line, journey = key
    if not all(re.fullmatch(r"[A-Za-z0-9_-]{1,40}", x) for x in key):
        return empty

    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=2.0) as con:
        con.execute("PRAGMA query_only=ON")
        rows = con.execute(
            """SELECT voertuignummer,lijnnummer,lat,lon,timestamp,richting
               FROM voertuigen
               WHERE lijnnummer=? AND ritnummer=? AND dienstdatum=?
                 AND versterking='0' AND timestamp BETWEEN ? AND ?
                 AND substr(voertuignummer,1,?)=?
               ORDER BY timestamp DESC LIMIT 2""",
            (line, journey, datum, now - LIVE_SECONDS, now + 120,
             len(operator) + 1, operator.upper() + "_")
        ).fetchall()
    if len(rows) != 1:
        # Meerdere voertuigen aan één rit: niet gokken welk voertuig rijdt.
        return empty
    vid, line_no, lat, lon, ts, direction = rows[0]
    return {**empty, "beschikbaar": True, "voertuig": {
        "voertuignummer": str(vid), "lijnnummer": str(line_no),
        "lat": round(float(lat), 6), "lon": round(float(lon), 6),
        "timestamp": int(ts), "leeftijd_s": max(0, now - int(ts)),
        "richting": float(direction) if direction is not None else None,
    }}