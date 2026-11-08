#!/usr/bin/env python3
"""NDOV KV6posinfo -> actuele voertuiglocaties in SQLite.

NDOV publiceert in de praktijk per operator (/GVB/KV6posinfo, /CXX/...)
in plaats van alleen /GOVI/KV6posinfo. Beide abonnementsvormen worden
ondersteund; uitsluitend KV6posinfo-berichten worden geparseerd.
"""
import gzip
import io
import os
import re
import sqlite3
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import zmq
from pyproj import Transformer, Geod

URL = os.environ.get("OVSPOT_MAPPER_ZMQ", "tcp://pubsub.besteffort.ndovloket.nl:7658")
DB = os.environ.get("OVSPOT_VOERTUIGEN_DB", "/var/lib/ovspot-live-mapper/live_voertuigen.db")
MAX_PAYLOAD = 3 * 1024 * 1024
MAX_XML = 16 * 1024 * 1024
VALID_EVENTS = {"ONROUTE", "ARRIVAL", "DEPARTURE", "ONSTOP", "OFFROUTE", "INIT"}
RD_WGS84 = Transformer.from_crs("EPSG:28992", "EPSG:4326", always_xy=True)
GEOD = Geod(ellps="WGS84")

SCHEMA = """
CREATE TABLE IF NOT EXISTS voertuigen (
    voertuignummer TEXT PRIMARY KEY,
    lijnnummer TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    timestamp INTEGER NOT NULL,
    ritnummer TEXT,
    dienstdatum TEXT,
    versterking TEXT,
    richting REAL
);
CREATE INDEX IF NOT EXISTS idx_voertuigen_timestamp ON voertuigen(timestamp);
CREATE INDEX IF NOT EXISTS idx_voertuigen_lijn_timestamp ON voertuigen(lijnnummer, timestamp);
CREATE INDEX IF NOT EXISTS idx_voertuigen_coords ON voertuigen(lat, lon);
"""
UPSERT = """
INSERT INTO voertuigen
    (voertuignummer,lijnnummer,lat,lon,timestamp,ritnummer,dienstdatum,versterking,richting)
VALUES (?,?,?,?,?,?,?,?,?)
ON CONFLICT(voertuignummer) DO UPDATE SET
    lijnnummer=excluded.lijnnummer,
    lat=excluded.lat,
    lon=excluded.lon,
    timestamp=excluded.timestamp,
    ritnummer=excluded.ritnummer,
    dienstdatum=excluded.dienstdatum,
    versterking=excluded.versterking,
    richting=excluded.richting
WHERE excluded.timestamp >= voertuigen.timestamp;
"""


def connect_db(db_path=DB):
    con = sqlite3.connect(db_path, timeout=10)
    con.execute("PRAGMA busy_timeout=10000")
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.executescript(SCHEMA)
    # Oude DB v1 veilig migreren: behoud historische velden en posities.
    current = {row[1] for row in con.execute("PRAGMA table_info(voertuigen)")}
    for name, kind in (("ritnummer", "TEXT"), ("dienstdatum", "TEXT"),
                       ("versterking", "TEXT"), ("richting", "REAL")):
        if name not in current:
            con.execute(f"ALTER TABLE voertuigen ADD COLUMN {name} {kind}")
    con.execute("CREATE INDEX IF NOT EXISTS idx_voertuigen_trip "
                "ON voertuigen(lijnnummer,ritnummer,dienstdatum,versterking,timestamp)")
    con.commit()
    return con


def _tag(tag):
    return tag.rsplit("}", 1)[-1].lower()


def _event_time(text, now):
    if not text:
        return now
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return now
        ts = int(parsed.timestamp())
        # Foutieve/vooruitlopende klokwaarden mogen niet als verse GPS verschijnen.
        return ts if 0 < ts <= now + 120 else now
    except (ValueError, OverflowError):
        return now


def extract(xml_bytes, topic, now=None):
    """Veilige, best-effort subset van positie-events; coord-conversie lon,lat -> lat,lon."""
    if len(xml_bytes) > MAX_XML:
        raise ValueError("XML is te groot")
    now = int(time.time() if now is None else now)
    root = ET.fromstring(xml_bytes)
    fallback_owner = topic.strip("/").split("/")[0].upper()
    positions = []
    for el in root.iter():
        if _tag(el.tag).upper() not in VALID_EVENTS:
            continue
        fields = {}
        for field in el.iter():
            if field is el or field.text is None:
                continue
            key = _tag(field.tag)
            value = field.text.strip()
            if value and key not in fields:
                fields[key] = value
        owner = (fields.get("dataownercode") or fallback_owner).upper()
        vehicle = fields.get("vehiclenumber", "").strip()
        line = fields.get("lineplanningnumber", "").strip()
        if (not owner or not vehicle or not line
                or not re.fullmatch(r"[A-Z0-9_-]{1,24}", owner)
                or not re.fullmatch(r"[A-Za-z0-9_.-]{1,40}", vehicle)
                or len(line) > 36):
            continue
        try:
            rd_x = float(fields["rd-x"])
            rd_y = float(fields["rd-y"])
        except (KeyError, ValueError, OverflowError):
            continue
        if not (0 < rd_x < 300000 and 275000 < rd_y < 650000):
            continue
        lon, lat = RD_WGS84.transform(rd_x, rd_y)
        if not (50.4 <= lat <= 54.1 and 3.0 <= lon <= 8.0):
            continue
        journey = fields.get("journeynumber", "").strip()
        op_day = fields.get("operatingday", "").strip()
        fortify = fields.get("reinforcementnumber", "0").strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,36}", journey):
            journey = ""
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", op_day):
            op_day = ""
        if not re.fullmatch(r"\d{1,4}", fortify):
            fortify = "0"
        positions.append((f"{owner}_{vehicle}", line, lat, lon,
                          _event_time(fields.get("timestamp"), now),
                          journey, op_day, fortify))
    return positions


def save_rows(con, rows):
    """Richting uit werkelijke opeenvolgende GPS-posities, niet uit lijn/vorm gegokt."""
    with con:
        for vehicle, line, lat, lon, ts, journey, op_day, fortify in rows:
            old = con.execute(
                "SELECT lat,lon,richting,timestamp FROM voertuigen WHERE voertuignummer=?",
                (vehicle,)
            ).fetchone()
            bearing = old[2] if old else None
            if old and ts >= old[3] and ts - old[3] <= 300:
                azimuth, _, meters = GEOD.inv(old[1], old[0], lon, lat)
                # GPS-ruis van een stilstaand voertuig niet als rijrichting tonen.
                if 12 <= meters <= 2500:
                    bearing = round((azimuth + 360) % 360, 1)
            con.execute(UPSERT, (vehicle, line, lat, lon, ts,
                                 journey or None, op_day or None,
                                 fortify, bearing))


def decompress(parts):
    compressed = b"".join(parts)
    if len(compressed) > MAX_PAYLOAD:
        raise ValueError("GZIP is te groot")
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as f:
        payload = f.read(MAX_XML + 1)
    if len(payload) > MAX_XML:
        raise ValueError("XML exceeds limit")
    return payload


def run():
    con = connect_db()
    context = zmq.Context()
    subscriber = context.socket(zmq.SUB)
    subscriber.setsockopt(zmq.RCVHWM, 3000)
    subscriber.setsockopt(zmq.LINGER, 0)
    # Expliciet gevraagd GOVI-topic, én de echte /<vervoerder>/KV6posinfo-topics.
    subscriber.setsockopt_string(zmq.SUBSCRIBE, "/GOVI/KV6posinfo")
    subscriber.setsockopt_string(zmq.SUBSCRIBE, "/")
    subscriber.connect(URL)
    print(f"NDOV KV6 mapper connected {URL} -> {DB}; GOVI + vervoerdertopics", flush=True)
    poller = zmq.Poller()
    poller.register(subscriber, zmq.POLLIN)
    messages = saved = rejected = 0
    last_log = last_cleanup = time.monotonic()
    try:
        while True:
            if subscriber not in dict(poller.poll(1500)):
                continue
            frames = subscriber.recv_multipart()
            if len(frames) < 2:
                continue
            topic = frames[0].decode("utf-8", "replace")
            if not topic.endswith("/KV6posinfo"):
                continue
            try:
                rows = extract(decompress(frames[1:]), topic)
                if rows:
                    save_rows(con, rows)
                saved += len(rows)
                messages += 1
            except (OSError, ValueError, EOFError, ET.ParseError, sqlite3.Error) as exc:
                rejected += 1
                if rejected <= 3 or rejected % 30 == 0:
                    print(f"KV6 parse/db error ({topic}): {exc}", flush=True)
            now = time.monotonic()
            if now - last_cleanup >= 90:
                with con:
                    con.execute("DELETE FROM voertuigen WHERE timestamp < ?",
                                (int(time.time()) - 3600,))
                last_cleanup = now
            if now - last_log >= 30:
                total = con.execute("SELECT COUNT(*) FROM voertuigen").fetchone()[0]
                print(f"NDOV heartbeat messages={messages} saved={saved} rejected={rejected} vehicles={total} topic={topic}", flush=True)
                last_log = now
    finally:
        subscriber.close(0)
        context.term()
        con.close()


if __name__ == "__main__":
    run()