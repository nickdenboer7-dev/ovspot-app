"""Tests voor ovspot_app_api tegen een nep-OVbord met echte OVbord-antwoordvormen (5 nov 2026)."""
import gzip
import json
import threading
import time
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import ovspot_app_api as api

TZ = api.TZ


def iso(minutes):
    return (datetime.now(TZ) + timedelta(minutes=minutes)).replace(second=0, microsecond=0).isoformat()


def hm(minutes):
    return (datetime.now(TZ) + timedelta(minutes=minutes)).strftime("%H:%M")


def dep(line, dest, mode, carrier, plan_min, delay_s=0, live=False, cancelled=False, platform="", trip="394512421", journey=""):
    return {
        "cancelled": cancelled, "carrier": carrier, "delay": delay_s, "departure_ahead": False, "destination": dest,
        "effective_time": iso(plan_min + delay_s / 60), "gtfs_trip_id": trip, "journey_id": journey, "line": line,
        "live": live, "mode": mode, "planned_at": iso(plan_min), "planned_time": hm(plan_min), "platform": platform,
        "service_date": datetime.now(TZ).date().isoformat(), "timing_live": live,
    }


NEARBY = [
    {"distance_m": 148, "id": "3963263", "lat": 53.1997, "lon": 5.7996, "lines": ["3", "8"], "modes": ["bus"], "name": "Leeuwarden, Blokhuisplein"},
    {"distance_m": 580, "id": "2993414", "lat": 53.1963, "lon": 5.7911, "lines": ["IC", "SPR"], "modes": ["train", "bus"], "name": "Leeuwarden"},
    {"distance_m": 2600, "id": "9999999", "lat": 53.2, "lon": 5.8, "lines": ["1"], "modes": ["bus"], "name": "Ver, Weg"},
]


def board(name):
    return {
        "departures": [
            dep("Intercity", "Schiphol Airport", "train", "NS", 4, delay_s=120, live=True, platform="5", trip="313312471"),
            dep("350", "Alkmaar", "bus", "QBUZZ", 7, platform="N"),
            dep("Stoptrein RS3", "Stavoren", "train", "Arriva", 9, cancelled=True, platform="2"),
            dep("21", "Drachten", "bus", "QBUZZ", -5),  # al vertrokken
            dep("60", "Holwert", "bus", "QBUZZ", 12, delay_s=-90, live=True, platform="J"),  # te vroeg
        ],
        "disruptions": [{"title": "Lijn 71 rijdt om via Stiens", "description": "Door werkzaamheden.", "badge": "Omleiding",
                         "effect": "DETOUR", "lines": ["71"], "severity": "medium", "active_periods": [[1793800000, 1794000000]],
                         "stop_ids": ["3963263"]}],
        "generated_at": datetime.now(TZ).isoformat(), "lat": 53.19, "lon": 5.79, "name": name, "ok": True, "stale": False,
        "stop_ref": "x",
    }


def journey(live):
    now = datetime.now(TZ)

    def stop(i, name, mins, state):
        t = (now + timedelta(minutes=mins)).strftime("%H:%M")
        return {"id": str(100 + i), "name": name, "epoch": int((now + timedelta(minutes=mins)).timestamp() * 1000),
                "arrival_time": t, "departure_time": t, "planned_arrival_time": t, "planned_departure_time": t,
                "delay_seconds": 60 if live and mins > 0 else None, "timing_live": live, "track": "", "state": state}

    return {
        "ok": True, "journey_id": "QBUZZ:1:1003", "gtfs_trip_id": "1", "service_date": now.date().isoformat(), "mode": "bus",
        "line": "1", "destination": "Grou", "carrier": "QBUZZ", "live": live, "delay": 60 if live else 0, "cancelled": False,
        "stops": [stop(0, "Leeuwarden, Busstation", -7, "passed"), stop(1, "Leeuwarden, Snekertrekweg", -5, "passed"),
                  stop(2, "Leeuwarden, Julianalaan", -1, "current"), stop(3, "Leeuwarden, Oostergoplein", 2, "future"),
                  stop(4, "Techum", 8, "future"), stop(5, "Grou, Busstation", 23, "future")],
        "disruptions": [{"title": "Halte vervalt: Techum", "badge": "Halte vervalt", "effect": "STOP_SKIPPED", "lines": ["1"], "stop_ids": ["104"]}],
        "gps_age_seconds": 8 if live else None, "shape": [[1, 2]] * 500, "vehicle": {"lat": 1, "lon": 2} if live else None,
    }


CALLS = []


class FakeOVbord(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        CALLS.append(self.path)
        p = self.path
        if p.startswith("/health"):
            body = {"ok": True}
        elif p.startswith("/api/nearby"):
            body = NEARBY
        elif p.startswith("/api/halte/404"):
            return self._send(404, {"ok": False, "error": "Halte niet gevonden"})
        elif p.startswith("/api/halte/"):
            body = board("Leeuwarden" if "2993414" in p else "Leeuwarden, Blokhuisplein")
        elif p.startswith("/api/rit/gtfs/"):
            body = journey(False)
        elif p.startswith("/api/rit/"):
            body = journey(True)
        elif p.startswith("/api/storingen/"):
            body = {"name": "Leeuwarden, Blokhuisplein", "items": board("x")["disruptions"]}
        elif p.startswith("/api/search"):
            body = {"results": [{"id": "3963263", "kind": "halte", "lat": 53.1, "lon": 5.7, "line_count": 9, "modes": ["bus"], "name": "Leeuwarden, Blokhuisplein"}]}
        else:
            return self._send(404, {"error": "?"})
        self._send(200, body)

    def _send(self, code, body):
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fake = ThreadingHTTPServer(("127.0.0.1", 0), FakeOVbord)
        threading.Thread(target=cls.fake.serve_forever, daemon=True).start()
        api.OVBORD = f"http://127.0.0.1:{cls.fake.server_address[1]}"
        cls.srv = api.Server(("127.0.0.1", 0), api.Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}/app/v1"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.fake.shutdown()

    def setUp(self):
        api.CACHE.data.clear()
        CALLS.clear()

    def get(self, path, headers=None):
        req = urllib.request.Request(self.base + path, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                raw = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
                return r.status, (json.loads(raw) if raw else None), r.headers
        except urllib.error.HTTPError as e:
            raw = e.read()
            return e.code, (json.loads(raw) if raw else None), e.headers

    def test_health(self):
        code, body, _ = self.get("/health")
        self.assertEqual(code, 200)
        self.assertTrue(body["ovbord"])

    def test_dichtbij(self):
        code, body, _ = self.get("/dichtbij?lat=53.2010&lon=5.7990")
        self.assertEqual(code, 200)
        names = [h["naam"] for h in body["haltes"]]
        self.assertEqual(names, ["Blokhuisplein", "Station Leeuwarden"])  # 2600 m valt buiten straal 1500
        first = body["haltes"][0]
        self.assertEqual(first["plaats"], "Leeuwarden")
        self.assertEqual(len(first["vertrekken"]), 2)
        self.assertEqual(first["vertrekken"][0]["lijn"], "IC")
        self.assertEqual(first["storingen_aantal"], 1)

    def test_dichtbij_straal(self):
        code, body, _ = self.get("/dichtbij?lat=53.2010&lon=5.7990&straal=5000&max=10")
        self.assertEqual(len(body["haltes"]), 3)

    def test_halte_mapping(self):
        code, body, _ = self.get("/halte/2993414")
        self.assertEqual(code, 200)
        self.assertEqual(body["naam"], "Station Leeuwarden")
        v = body["vertrekken"]
        self.assertEqual([x["bestemming"] for x in v], ["Schiphol Airport", "Alkmaar", "Stavoren", "Holwert"])  # Drachten al weg
        ic, bus, rs3, vroeg = v
        self.assertEqual((ic["lijn"], ic["vertraging_min"], ic["live"], ic["spoor"], ic["vervoerder"]), ("IC", 2, True, "5", "NS"))
        self.assertEqual(ic["rit"]["trip"], "313312471")
        self.assertEqual((bus["lijn"], bus["live"], bus["vervoerder"]), ("350", False, "Qbuzz"))
        self.assertEqual((rs3["lijn"], rs3["vervallen"], rs3["live"]), ("RS3", True, False))
        self.assertEqual(vroeg["vertraging_min"], 0)
        self.assertEqual(vroeg["verwacht"], vroeg["gepland"])  # te vroeg: geplande tijd tonen
        self.assertEqual(body["storingen"][0]["soort"], "omleiding")
        self.assertNotIn("_skip", body["storingen"][0])

    def test_halte_modus(self):
        _, trein, _ = self.get("/halte/2993414?modus=trein")
        _, bus, _ = self.get("/halte/2993414?modus=bus")
        self.assertTrue(all(x["modus"] == "train" for x in trein["vertrekken"]))
        self.assertTrue(all(x["modus"] != "train" for x in bus["vertrekken"]))
        code, _, _ = self.get("/halte/2993414?modus=boot")
        self.assertEqual(code, 400)

    def test_halte_404_en_ongeldig(self):
        code, body, _ = self.get("/halte/404")
        self.assertEqual(code, 404)
        self.assertEqual(body["fout"], "Halte niet gevonden")
        code, _, _ = self.get("/halte/..%2F..%2Fetc")
        self.assertEqual(code, 400)

    def test_cache_en_etag(self):
        code, body, h = self.get("/halte/2993414")
        n = len(CALLS)
        code2, body2, h2 = self.get("/halte/2993414", {"If-None-Match": h["ETag"]})
        self.assertEqual(len(CALLS), n)  # uit cache
        self.assertEqual(code2, 304)

    def test_gzip(self):
        req = urllib.request.Request(self.base + "/halte/2993414", headers={"Accept-Encoding": "gzip"})
        with urllib.request.urlopen(req) as r:
            self.assertEqual(r.headers.get("Content-Encoding"), "gzip")
            json.loads(gzip.decompress(r.read()))

    def test_rit_live(self):
        code, body, _ = self.get("/rit?voertuig=QBUZZ:1:1003")
        self.assertEqual(code, 200)
        self.assertTrue(body["live"])
        self.assertEqual(body["vervoerder"], "Qbuzz")
        st = [s["status"] for s in body["haltes"]]
        # The third stop is exactly one minute old. Depending on the
        # wall-clock boundary it may be past or upcoming, but NEVER current.
        self.assertEqual(st[:2], ["geweest", "geweest"])
        self.assertIn(st[2], ("geweest", "komt"))
        self.assertEqual(st[3:], ["komt", "komt", "komt"])
        self.assertNotIn("huidig", st)
        # The simulated Qbuzz journey has no stop GPS coordinates.
        # Fresh telemetry by itself must not claim an exact current stop.
        self.assertIsNone(body["nu_hier"])
        self.assertFalse(body["positie_betrouwbaar"])
        self.assertTrue(body["haltes"][4]["vervalt"])
        self.assertEqual(body["haltes"][5]["naam"], "Busstation")
        self.assertEqual(body["haltes"][5]["plaats"], "Grou")
        self.assertNotIn("shape", body)

    def test_rit_gepland(self):
        code, body, _ = self.get("/rit?trip=313312471&datum=2026-11-05")
        self.assertEqual(code, 200)
        self.assertFalse(body["live"])
        self.assertIsNone(body["nu_hier"])
        self.assertTrue(any("/api/rit/gtfs/313312471?service_date=2026-11-05" in c for c in CALLS))
        code, _, _ = self.get("/rit?trip=1&datum=gisteren")
        self.assertEqual(code, 400)
        code, _, _ = self.get("/rit")
        self.assertEqual(code, 400)

    def test_storingen(self):
        code, body, _ = self.get("/storingen?haltes=3963263,2993414,3963263")
        self.assertEqual(code, 200)
        self.assertEqual(body["aantal"], 1)  # samengevoegd
        self.assertEqual(len(body["storingen"][0]["haltes"]), 2)
        code, body, _ = self.get("/storingen?haltes=")
        self.assertEqual(body["aantal"], 0)

    def test_zoek(self):
        code, body, _ = self.get("/zoek?q=blokhuis")
        self.assertEqual(body["resultaten"][0]["naam"], "Blokhuisplein")
        code, body, _ = self.get("/zoek?q=b")
        self.assertEqual(body["resultaten"], [])

    def test_upstream_down(self):
        old = api.OVBORD
        api.OVBORD = "http://127.0.0.1:1"
        try:
            code, body, _ = self.get("/halte/123")
            self.assertEqual(code, 502)
            code, _, _ = self.get("/health")
            self.assertEqual(code, 503)
        finally:
            api.OVBORD = old

    def test_onbekend(self):
        code, _, _ = self.get("/bestaatniet")
        self.assertEqual(code, 404)

    def test_short_line(self):
        self.assertEqual(api.short_line("Sprinter", "train"), "SPR")
        self.assertEqual(api.short_line("Sneltrein RE1", "train"), "RE1")
        self.assertEqual(api.short_line("Snelbus ipv trein", "bus"), "Bus")
        self.assertEqual(api.short_line("Intercity direct", "train"), "ICD")


if __name__ == "__main__":
    unittest.main()
