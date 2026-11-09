import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geldigeRitPositie } from "../lib/liveRitKaart.ts";
import { isGpsActueel, projecteerGpsOpRit, ritGpsStatus } from "../lib/ritverloopV2.ts";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const map = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");
const id = "gtfs/390640246";
const datum = "2026-11-09";
const now = 1794241355 * 1000;
const response = {
  ok: true, beschikbaar: true, rit_id: id, datum,
  voertuig: {
    voertuignummer: "EBS_4361", lijnnummer: "1395",
    lat: 52.429771, lon: 4.856271,
    timestamp: 1794241353, leeftijd_s: 2, richting: 352.5
  }
};
const route = {
  haltes: [
    { id: "3183846", naam: "Amsterdam, Westkolkdijk", vervalt: false },
    { id: "3183838", naam: "Zaandam, De Vlinder", vervalt: false },
    { id: "3183796", naam: "Zaandam, Weerpad/Wachterstraat", vervalt: false }
  ],
  stops: [
    { stop_id: "3183846", latitude: 52.43003, longitude: 4.864031 },
    { stop_id: "3183838", latitude: 52.429726, longitude: 4.856271 },
    { stop_id: "3183796", latitude: 52.434994, longitude: 4.85465 }
  ]
};

test("Actual 395 Zaandam ZMC case: a 2-second GPS fix is fresh and projects onto stop order", () => {
  const gps = geldigeRitPositie(response, id, datum);
  assert.ok(gps);
  assert.equal(gps.voertuignummer, "EBS_4361");
  const segment = projecteerGpsOpRit(route, gps);
  assert.ok(segment, "GPS is near route geometry, not outdated");
  assert.equal(isGpsActueel(gps, now), true);
  assert.equal(ritGpsStatus(gps, now, !!segment), "GPS actueel");
});

test("Map and stop list share one continuously polled fix, without changing key when switching views", () => {
  assert.match(screen, /"ritV2gps:" \+ rit\?\.id \+ ":" \+ rit\?\.datum,/);
  assert.doesNotMatch(screen, /isKaart \? "kaart" : "lijst"/);
  assert.match(screen, /api\.liveRitVoertuig\(rit\.id, rit\.datum\)/);
  assert.match(screen, /positie=\{actueel \? gps : null\}/);
  assert.match(map, /positie: LiveRitPositie \| null/);
  assert.doesNotMatch(map, /api\.liveRitVoertuig\(|setInterval\(\(\) => void ophalen/);
});

test("A transient request failure does not invalidate a previously fresh GPS fix", () => {
  assert.match(screen, /const actueel = isGpsActueel\(gps, nu\)/);
  assert.doesNotMatch(screen, /isGpsActueel\(gps, nu, !!gpsPoll\.fout\)/);
  const gps = geldigeRitPositie(response, id, datum);
  assert.equal(ritGpsStatus(gps, now, true), "GPS actueel");
  assert.equal(ritGpsStatus(gps, now + 46000, true), "GPS verouderd");
});

test("Different GPS failure types are labelled accurately instead of all saying outdated", () => {
  const gps = geldigeRitPositie(response, id, datum);
  assert.equal(ritGpsStatus(gps, now, false), "GPS niet op route");
  assert.equal(ritGpsStatus(null, now, false, { laden: true }), "GPS ophalen…");
  assert.equal(ritGpsStatus(null, now, false), "Geen voertuig-GPS");
  assert.equal(ritGpsStatus(gps, now, true, { enabled: false }), "GPS uitgeschakeld");
  assert.equal(ritGpsStatus(gps, now, true, { trein: true }), "Geen voertuig-GPS");
  assert.match(screen, /t\(gpsStatus\)/);
});

test("Map stops rendering a live marker when position is stale", () => {
  assert.match(screen, /positie=\{actueel \? gps : null\}/);
  assert.match(map, /\{positie && heeftGeldigeVoertuigPositie \? \(/);
  assert.match(map, /if \(!positie \|\| !Number\.isFinite\(positie\.lat\)/);
});
