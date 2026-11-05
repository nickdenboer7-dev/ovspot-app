"""Regression tests for truthful KV6/GPS stop position display."""
import unittest
import ovspot_app_api as api

NOW = 1_793_845_800_000

def scenario(offset_ms=120_000):
    rows = [
        {"naam": "Vorig", "status": "geweest", "tijd_ms": NOW - 120000},
        {"naam": "Westkolkdijk", "status": "huidig", "tijd_ms": NOW + offset_ms},
        {"naam": "De Vlinder", "status": "komt", "tijd_ms": NOW + 5 * 60000},
    ]
    raw = [
        {"lat": 52.429, "lon": 4.860},
        {"lat": 52.43003, "lon": 4.864031},
        {"lat": 52.4305, "lon": 4.857},
    ]
    return rows, raw

class PositionGeoTest(unittest.TestCase):
    def test_395_future_stop_must_not_show_nu_hier(self):
        rows, raw = scenario(120000)  # screenshot: 10:30, stop at 10:32
        vehicle={"lat": 52.4329, "lon": 4.8635}  # ~320m from stop
        p=api.rit_positie(rows,True,13,NOW,vehicle,raw)
        self.assertIsNotNone(p)
        self.assertFalse(p["bij_halte"])
        self.assertEqual(p["volgende_naam"],"Westkolkdijk")
        self.assertEqual(p["volgende_index"],1)
        self.assertEqual(p["na_index"],0)
        self.assertFalse(any(x["status"]=="huidig" for x in rows))
        self.assertGreater(p["afstand_tot_halte_m"],80)
        self.assertLess(p["afstand_tot_halte_m"],1000)

    def test_394_stop_in_one_minute_not_automatically_current(self):
        rows, raw = scenario(60000)
        vehicle={"lat": 52.4320, "lon": 4.8640}  # ~220m before stop
        p=api.rit_positie(rows,True,15,NOW,vehicle,raw)
        self.assertFalse(p["bij_halte"])
        self.assertEqual(rows[1]["status"],"komt")

    def test_near_stop_with_measured_gps_can_show_nu_hier(self):
        rows, raw = scenario()
        vehicle={"lat": 52.4302, "lon": 4.86405}
        p=api.rit_positie(rows,True,12,NOW,vehicle,raw)
        self.assertTrue(p["bij_halte"])
        self.assertEqual(rows[1]["status"],"huidig")
        self.assertLess(p["afstand_tot_halte_m"],80)

    def test_no_coordinates_never_claim_exact_stop(self):
        rows, raw = scenario()
        p=api.rit_positie(rows,True,8,NOW,{"lat":None,"lon":None},raw)
        self.assertIsNone(p)
        self.assertNotIn("huidig",[x["status"] for x in rows])

    def test_vehicle_far_from_alleged_stop_is_unconfirmed(self):
        rows, raw = scenario()
        p=api.rit_positie(rows,True,8,NOW,{"lat":52.4800,"lon":4.9000},raw)
        self.assertIsNone(p)
        self.assertNotIn("huidig",[x["status"] for x in rows])

    def test_old_gps_does_not_claim_position(self):
        rows, raw = scenario()
        p=api.rit_positie(rows,True,190,NOW,{"lat":52.43003,"lon":4.864031},raw)
        self.assertIsNone(p)

    def test_scheduled_stoptime_outside_window_rejected(self):
        rows, raw = scenario(15*60000)
        p=api.rit_positie(rows,True,8,NOW,{"lat":52.43003,"lon":4.864031},raw)
        self.assertIsNone(p)

    def test_gps_same_stop_zero_distance(self):
        self.assertEqual(api._afstand_voertuig_halte_m(
            {"lat":52.43003,"lon":4.864031},
            {"lat":52.43003,"lon":4.864031}),0)

if __name__=="__main__":
    unittest.main()
