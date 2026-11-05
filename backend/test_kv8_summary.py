"""EBS KV8 headline must never borrow data from past or later stops."""
import unittest
import ovspot_app_api as api

T = 1_793_845_080_000

def stop(name, offset_m, kv8=False, *, status="komt", cancelled=False):
    return {
        "naam": name, "tijd_ms": T + offset_m * 60_000,
        "bron_tijd": "KV8" if kv8 else "dienstregeling",
        "live_tijd": kv8, "vertraging_min": 5 if kv8 else 0,
        "vervalt": cancelled, "status": status,
    }

class SummaryTest(unittest.TestCase):
    def test_past_kv8_cannot_make_header_live(self):
        rows = [stop("Past", -12, True, status="geweest"),
                stop("Next", 2, False),
                stop("Later", 4, False)]
        result = api.kv8_rit_overzicht(rows, T)
        self.assertFalse(result["live"])
        self.assertEqual(result["tijden_bron"], "dienstregeling")
        self.assertEqual(result["vertraging_min"], 0)

    def test_later_kv8_is_not_claimed_for_planned_next_stop(self):
        rows = [stop("Next", 2, False), stop("Later", 5, True)]
        result = api.kv8_rit_overzicht(rows, T)
        self.assertFalse(result["live"])
        self.assertEqual(result["vertraging_min"], 0)
        self.assertEqual(result["kv8_komende_haltes"], 1)
        self.assertEqual(result["komende_haltes"], 2)

    def test_next_kv8_uses_its_own_delay(self):
        rows = [stop("Next", 2, True), stop("Later", 6, False)]
        result = api.kv8_rit_overzicht(rows, T)
        self.assertTrue(result["live"])
        self.assertEqual(result["tijden_bron"], "KV8")
        self.assertEqual(result["vertraging_min"], 5)

    def test_future_only_excludes_cancelled_stop(self):
        rows = [stop("Cancelled", 1, True, cancelled=True),
                stop("Next", 2, False)]
        result = api.kv8_rit_overzicht(rows, T)
        self.assertFalse(result["live"])
        self.assertEqual(result["kv8_komende_haltes"], 0)
        self.assertEqual(result["komende_haltes"], 1)

    def test_all_passed_is_never_live(self):
        rows = [stop("Past", -20, True, status="geweest")]
        result = api.kv8_rit_overzicht(rows, T)
        self.assertFalse(result["live"])
        self.assertEqual(result["kv8_komende_haltes"], 0)
        self.assertEqual(result["komende_haltes"], 0)

    def test_no_timestamps_is_safe(self):
        rows = [stop("Unknown", 0, True)]
        rows[0]["tijd_ms"] = None
        result = api.kv8_rit_overzicht(rows, T)
        self.assertFalse(result["live"])
        self.assertEqual(result["tijden_bron"], "dienstregeling")

if __name__ == "__main__":
    unittest.main()
