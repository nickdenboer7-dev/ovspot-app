import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  isGpsActueel, projecteerGpsOpRit, ritGpsStatus
} from "../lib/ritverloopV2.ts";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const stop = (id, latitude, longitude) => ({
  stop_id: id, stop_name: id, stop_sequence: 1, latitude, longitude
});
const halt = id => ({ id, naam: id, vervalt: false });

// The bus travels around a long bend 400+ m away from the chord A--B.
// Old code projected on the straight line and incorrectly reported "not on route".
const bend = {
  haltes: [halt("A"), halt("B"), halt("C")],
  stops: [stop("A", 52.0, 5.0), stop("B", 52.0, 5.01), stop("C", 52.0, 5.02)],
  shape: [
    { latitude: 52.0, longitude: 5.0 },
    { latitude: 52.004, longitude: 5.0 },
    { latitude: 52.004, longitude: 5.01 },
    { latitude: 52.0, longitude: 5.01 },
    { latitude: 52.0, longitude: 5.02 }
  ]
};
const onBend = { lat: 52.004, lon: 5.005 };

test("Curved GTFS shape correctly maps vehicle that is >400 m off straight stop connection", () => {
  const old = projecteerGpsOpRit({ ...bend, shape: undefined }, onBend);
  assert.equal(old, null);
  const newer = projecteerGpsOpRit(bend, onBend);
  assert.ok(newer, "Physical shape should restore the route assignment");
  assert.equal(newer.vorigeIndex, 0);
  assert.equal(newer.volgendeIndex, 1);
  assert.ok(newer.afstandM < 2, "GPS on physical route");
  assert.ok(newer.fractie > 0.2 && newer.fractie < 0.9);
});

test("Malformed, reversed or out-of-country data does not fabricate a route segment", () => {
  assert.equal(projecteerGpsOpRit(bend, { lat: 0, lon: 0 }), null);
  assert.equal(projecteerGpsOpRit({ ...bend, shape: bend.shape.slice().reverse() }, onBend), null);
  assert.equal(projecteerGpsOpRit({ ...bend, shape: [] }, onBend), null);
  assert.equal(projecteerGpsOpRit({ ...bend, shape: [{ latitude: NaN, longitude: 5.0 }, bend.shape[1]] }, onBend), null);
});

test("Loop routes at the same GPS coordinate still reject ambiguous vehicle progress", () => {
  const loop = {
    haltes: ["A", "B", "C", "D", "E"].map(halt),
    stops: [
      stop("A", 52.0, 5.0), stop("B", 52.0, 5.01),
      stop("C", 52.005, 5.02), stop("D", 52.0, 5.0),
      stop("E", 52.0, 5.01)
    ],
    shape: [
      { latitude: 52.0, longitude: 5.0 },
      { latitude: 52.0, longitude: 5.01 },
      { latitude: 52.005, longitude: 5.02 },
      { latitude: 52.0, longitude: 5.0 },
      { latitude: 52.0, longitude: 5.01 }
    ]
  };
  assert.equal(projecteerGpsOpRit(loop, { lat: 52.0, lon: 5.005 }), null);
});

test("GPS timestamp and route mapping are independently represented", () => {
  const now = 1794241355000;
  const fresh = { timestamp: now / 1000 - 8, leeftijd_s: 8 };
  assert.equal(isGpsActueel(fresh, now), true);
  assert.equal(ritGpsStatus(fresh, now, false), "GPS actueel");
  assert.equal(ritGpsStatus(fresh, now + 47000, false), "GPS verouderd");
  assert.equal(ritGpsStatus(null, now, false), "Geen voertuig-GPS");
  assert.equal(ritGpsStatus(null, now, false, { trein: true }), "Geen voertuig-GPS");
});

test("GPS precision never implies a stop marker without a unique projected segment", () => {
  assert.match(screen, /const segment = useMemo/);
  assert.match(screen, /projecteerGpsOpRit\(rit, gps\)/);
  assert.match(screen, /segment && actueel && rijdend && r.index === segment.volgendeIndex/);
  assert.match(screen, /chip=\{nogNietVertrokken \? "Geen voertuig-GPS" : !trein \? gpsStatus/);
  assert.match(screen, /<StatusStrook/);
  assert.doesNotMatch(screen, /gpsStatus === "GPS niet op route"/);
});

// Frozen public GTFS route and 2026-11-09 NDOV GPS sample (no live API in tests).
const real = JSON.parse(readFileSync(new URL("./fixtures/rit-gps-real-shape-20261109.json", import.meta.url), "utf8"));
test("Actual Qbuzz detour: GTFS shape repairs a missing stop-segment match", () => {
  assert.equal(projecteerGpsOpRit({ ...real.rit, shape: undefined }, real.gps), null);
  const result = projecteerGpsOpRit(real.rit, real.gps);
  assert.ok(result);
  assert.equal(result.vorigeIndex, real.expected.vorigeIndex);
  assert.equal(result.volgendeIndex, real.expected.volgendeIndex);
  assert.ok(result.afstandM < 20);
});
