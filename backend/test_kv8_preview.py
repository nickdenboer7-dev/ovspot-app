"""Regression tests for strict EBS KV8 event precedence in OVspot preview."""
import unittest
from datetime import datetime
from unittest.mock import patch
import ovspot_app_api as api


def iso(s):
    return datetime.fromisoformat('2026-11-05T'+s+'+01:00').isoformat()

def kv8_stop(name, p_arr, p_dep, e_arr, e_dep, age=16, live=True):
    expected = lambda x: iso(x) if x else None
    return {
        "id":"4161400", "name": f"Het Schouw, {name}",
        "planned_arrival_at": expected(p_arr),
        "planned_departure_at": expected(p_dep),
        "planned_arrival_time": p_arr[:5] if p_arr else "—",
        "planned_departure_time": p_dep[:5] if p_dep else "—",
        "arrival_time": p_arr[:5] if p_arr else "—",
        "departure_time": e_dep[:5] if e_dep else "—",
        "estimated_arrival_at": expected(e_arr),
        "estimated_departure_at": expected(e_dep),
        "epoch": int(datetime.fromisoformat(expected(e_dep or p_dep)).timestamp()*1000) if e_dep or p_dep else None,
        "kv8_fresh": live,
        "timing_source": "kv8_expected" if live else None,
        "rt_provider": "kv8" if live else None,
        "rt_feed_age_seconds": age,
        "timing_live": live,
        "delay_seconds": 240 if live else None,
    }


class KV8OnlyTest(unittest.TestCase):
    def map(self, row):
        return api.map_stop(row,set(),prefer_kv8=True)

    def test_n14_de_zedde_no_artificial_dwell(self):
        h=self.map(kv8_stop('De Zedde','04:59:43','04:59:43','05:04:00','05:04:00'))
        self.assertEqual((h["aankomst"],h["vertrek"],h["verwacht"]),("05:04","05:04","05:04"))
        self.assertEqual(h["gepland"],"04:59")
        self.assertEqual(h["bron_tijd"],"KV8")
        self.assertTrue(h["live_tijd"])
        self.assertEqual(h["vertraging_min"],4)

    def test_n14_splitsing_identical_kv8_arrival_departure(self):
        h=self.map(kv8_stop('Splitsing','05:09:00','05:09:00','05:12:20','05:12:20'))
        self.assertEqual((h["aankomst"],h["vertrek"]),("05:12","05:12"))
        self.assertEqual(h["vertraging_min"],3)

    def test_111_with_missing_kv8_uses_schedule(self):
        h=self.map(kv8_stop('Station Noord','05:15:00','05:17:00',None,None,live=False))
        self.assertEqual((h["aankomst"],h["vertrek"],h["verwacht"]),("05:15","05:17","05:17"))
        self.assertFalse(h["live_tijd"])
        self.assertEqual(h["bron_tijd"],"dienstregeling")
        self.assertEqual(h["vertraging_min"],0)

    def test_old_kv8_is_not_live(self):
        h=self.map(kv8_stop('Splitsing','05:09:00','05:09:00','05:12:20','05:12:20',age=900))
        self.assertEqual(h["verwacht"],"05:09")
        self.assertFalse(h["live_tijd"])

    def test_early_kv8_departure_does_not_move_before_schedule(self):
        h=self.map(kv8_stop('Vorticellaweg','05:07:00','05:07:00','05:06:57','05:06:57'))
        self.assertEqual((h["aankomst"],h["vertrek"],h["verwacht"]),("05:07","05:07","05:07"))
        self.assertEqual(h["bron_tijd"],"KV8")

    def test_genuine_dwell_still_visible(self):
        h=self.map(kv8_stop('Station Noord','05:15:00','05:17:00','05:16:00','05:18:00'))
        self.assertEqual((h["aankomst"],h["vertrek"]),("05:16","05:18"))
        self.assertTrue(h["live_tijd"])

    def test_non_ebs_raw_mapping_is_unchanged(self):
        row=kv8_stop('De Zedde','04:59:43','04:59:43','05:04:00','05:04:00')
        raw=api.map_stop(row,set())
        self.assertEqual(raw["aankomst"],"04:59")
        self.assertNotIn("bron_tijd",raw)

    def test_inconsistent_arrival_departure_falls_back_to_schedule(self):
        h=self.map(kv8_stop('Splitsing','05:09:00','05:09:00','05:14:00','05:12:00'))
        self.assertEqual(h["verwacht"],"05:09")
        self.assertFalse(h["live_tijd"])

    def test_implausible_kv8_shift_rejected(self):
        h=self.map(kv8_stop('Splitsing','05:09:00','05:09:00','05:50:00','05:50:00'))
        self.assertEqual(h["verwacht"],"05:09")
        self.assertFalse(h["live_tijd"])

if __name__ == '__main__':
    unittest.main()
