"""OVspot V1.1 regressies: lusrit, bronversheid, tijdvolgorde en haltepassage."""
import unittest
from datetime import datetime
from unittest.mock import patch

import ovspot_app_api as api


class V11Test(unittest.TestCase):
    def test_hhmm_invalid_departure_before_arrival(self):
        self.assertEqual(api.sanitize_arrival_departure("03:14", "03:11"), ("", ""))

    def test_early_kv8_prediction_not_shown_as_early_departure(self):
        planned = "2026-11-05T04:18:00+01:00"
        early_epoch = int(datetime.fromisoformat("2026-11-05T04:13:34+01:00").timestamp() * 1000)
        record = {
            "id": "4161401", "name": "Het Schouw, Splitsing",
            "planned_arrival_at": planned, "planned_departure_at": planned,
            "planned_arrival_time": "04:18", "planned_departure_time": "04:18",
            "arrival_time": "04:18", "departure_time": "04:13",
            "epoch": early_epoch, "delay_seconds": -266,
            "departure_delay_seconds": -266, "timing_live": True,
        }
        result = api.map_stop(record, set())
        self.assertEqual(result["gepland"], "04:18")
        self.assertEqual(result["verwacht"], "04:18")
        self.assertEqual(result["aankomst"], "04:18")
        self.assertEqual(result["vertrek"], "04:18")
        self.assertEqual(result["tijd_ms"],
                         int(datetime.fromisoformat(planned).timestamp() * 1000))

    def test_hhmm_midnight_short_stop(self):
        self.assertEqual(api.sanitize_arrival_departure("23:59", "00:01"), ("23:59", "00:01"))

    def test_bad_arrival_departure_falls_back_to_epoch(self):
        epoch = int(datetime(2026, 11, 5, 3, 14, tzinfo=api.TZ).timestamp() * 1000)
        src = {"id": "x", "name": "Ilpendam, Ilpendam",
               "planned_departure_time": "03:11", "planned_arrival_time": "03:14",
               "departure_time": "03:11", "arrival_time": "03:14", "epoch": epoch}
        item = api.map_stop(src, set())
        self.assertEqual((item["aankomst"], item["vertrek"]), ("", ""))
        self.assertEqual(item["gepland"], "03:14")
        self.assertEqual(item["verwacht"], "03:14")

    def test_stale_current_stop_is_not_live_position_even_with_fresh_gps(self):
        now = 1_793_845_020_000
        stops = [
            {"naam": "Splitsing", "status": "huidig", "tijd_ms": now-40*60_000},
            {"naam": "De Dollard", "status": "komt", "tijd_ms": now-39*60_000},
            {"naam": "Splitsing", "status": "komt", "tijd_ms": now+60_000},
        ]
        self.assertIsNone(api.rit_positie(stops, True, 6, now))
        self.assertFalse(any(x["status"] == "huidig" for x in stops))

    def test_fresh_real_position(self):
        now = 1_793_845_020_000
        stops = [
            {"naam": "Vorige", "status": "geweest", "tijd_ms": now-60_000},
            {"naam": "Huidige", "status": "huidig", "tijd_ms": now},
            {"naam": "Volgende", "status": "komt", "tijd_ms": now+120_000},
        ]
        p = api.rit_positie(stops, True, 6, now)
        self.assertIsNotNone(p)
        self.assertTrue(p["bij_halte"])
        self.assertEqual(p["volgende_naam"], "Huidige")

    def test_old_gps_cannot_claim_position(self):
        now = 1_793_845_020_000
        stops = [{"naam": "Huidige", "status": "huidig", "tijd_ms": now},
                 {"naam": "Volgende", "status": "komt", "tijd_ms": now+60_000}]
        self.assertIsNone(api.rit_positie(stops, True, 190, now))

    def test_select_second_passage_for_return_leg(self):
        t = 1_793_845_080_000
        stops = [{"id": "4161400", "naam": "Splitsing", "tijd_ms": t-43*60_000}]
        stops += [{"id": str(i), "naam": "X", "tijd_ms": t-(42-i)*60_000} for i in range(1, 42)]
        stops += [{"id": "4161401", "naam": "Splitsing", "tijd_ms": t}]
        stops += [{"id": "last", "naam": "Centraal Station", "tijd_ms": t+8*60_000}]
        full, found, index = api.select_boarding_segment(stops, "4161400", "Splitsing", t)
        self.assertTrue(found)
        self.assertEqual(index, 42)  # second passage despite different ID
        self.assertEqual(full[-2]["id"], "4161401")
        self.assertEqual(full[0]["id"], "4161400")
        self.assertEqual(len(full), len(stops))

    def test_no_segment_without_confirmed_passage(self):
        stops=[{"id":"x","naam":"X","tijd_ms":1000}]
        self.assertEqual(api.select_boarding_segment(stops,"other","Y",1000),(stops,False,None))

    def test_full_route_preserved_for_late_boarding(self):
        now = 1_793_845_080_000
        stops = [
            {"id": str(i), "naam": f"Stop {i}", "tijd_ms": now + i * 60_000}
            for i in range(36)
        ]
        result, found, index = api.select_boarding_segment(stops, "30", "Stop 30", now + 30 * 60_000)
        self.assertTrue(found)
        self.assertEqual(index, 30)
        self.assertEqual(len(result), 36)
        self.assertEqual(result[0]["naam"], "Stop 0")
        self.assertEqual(result[-1]["naam"], "Stop 35")

    def test_stale_halte_demotes_live(self):
        raw = {"name": "Test, Halte", "stale": True, "departures": [{
            "line": "N06", "destination": "A", "planned_at": "2026-11-05T03:00:00+01:00",
            "effective_time": "2026-11-05T03:00:00+01:00", "live": True
        }]}
        with patch.object(api, "ovbord_halte", return_value=raw), patch.object(api, "upcoming", side_effect=lambda a,now:a):
            result = api.halte("test")
        self.assertFalse(result["vertrekken"][0]["live"])


if __name__ == "__main__":
    unittest.main()
