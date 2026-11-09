import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GPS_HERSTEL_INTERVAL_MS, magGpsAutomatischHerstellen, moetGpsBijTerugkeerVernieuwd
} from "../lib/gpsRecovery.ts";

const nearby = readFileSync(new URL("../app/(tabs)/index.tsx", import.meta.url), "utf8");

test("GPS off/timeout/error are retried, but denied permissions are never re-prompted", () => {
  assert.equal(GPS_HERSTEL_INTERVAL_MS, 15_000);
  for (const reason of ["uit", "timeout", "fout"]) {
    assert.equal(magGpsAutomatischHerstellen(reason), true);
    assert.equal(moetGpsBijTerugkeerVernieuwd(reason, 0, 15_000, 15_000), true);
  }
  for (const reason of ["geweigerd", "geweigerd-blijvend", null]) {
    assert.equal(magGpsAutomatischHerstellen(reason), false);
  }
  assert.equal(moetGpsBijTerugkeerVernieuwd("geweigerd", 0, 30_000, 15_000), false);
});

test("Fresh GPS does not repeat continuously, but stale GPS is refreshed on return", () => {
  assert.equal(moetGpsBijTerugkeerVernieuwd(null, 1000, 10000, 15000), false);
  assert.equal(moetGpsBijTerugkeerVernieuwd(null, 1000, 16000, 15000), true);
  assert.equal(moetGpsBijTerugkeerVernieuwd(null, 0, 50000, 15000), false);
  assert.equal(moetGpsBijTerugkeerVernieuwd(null, 1000, 31000, 600000), false);
});

test("Nearby listens for Android quick-settings focus and foreground reentry", () => {
  assert.match(nearby, /AppState\.addEventListener\("focus", \(\) => controleerBijTerugkeer\(true\)\)/);
  assert.match(nearby, /AppState\.addEventListener\("change", toestand/);
  assert.match(nearby, /clearInterval\(timer\)/);
  assert.match(nearby, /magGpsAutomatischHerstellen\(locFoutRef\.current\)/);
  assert.match(nearby, /!zoektRef\.current/);
  assert.match(nearby, /locFoutRef\.current = fout;/);
  assert.match(nearby, /locFoutRef\.current = reden;/);
  assert.match(nearby, /setLocFout\(fout\)/);
});
