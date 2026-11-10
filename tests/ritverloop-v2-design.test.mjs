import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  bouwRitV2Haltes, compacteHalteNaam, isGpsActueel, projecteerGpsOpRit,
  telKlokMinuten, verwachteAankomstMin, RITV2
} from "../lib/ritverloopV2.ts";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const stopScreen = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
const marker = readFileSync(new URL("../components/RijdendVoertuig.tsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("../components/OnderBalk.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const a = (x) => ({ id: x[0], naam: x[1], plaats: x[2] || "Amsterdam",
  gepland: x[3] || "02:11", verwacht: x[4] || x[3] || "02:11",
  vertrek: "", aankomst: "", tijd_ms: x[5], live_tijd: x[6], vertraging_min: x[7] || 0,
  status: x[8] || "komt", vervalt: false });
const rit = {
  live: true, vervallen: false, datum: "2026-11-09", haltes: [
    a(["A", "Amsterdam, Beukenweg", "Amsterdam", "02:11", "02:13", 1794186780000, true, 2, "geweest"]),
    a(["B", "Amsterdam, Alexanderplein", "Amsterdam", "02:13", "02:13", 1794186780000, false, 0]),
    a(["C", "Amsterdam, Plantage Lepellaan", "Amsterdam", "02:15", "02:15", 1794186900000, true, 0]),
    a(["D", "Haarlem, Station", "Haarlem", "02:22", "02:22", 1794187320000, false, 0])
  ],
  stops: [
    { stop_id: "A", stop_sequence: 1, latitude: 52.36, longitude: 4.900 },
    { stop_id: "B", stop_sequence: 2, latitude: 52.36, longitude: 4.902 },
    { stop_id: "C", stop_sequence: 3, latitude: 52.36, longitude: 4.904 },
    { stop_id: "D", stop_sequence: 4, latitude: 52.39, longitude: 4.905 }
  ]
};

test("Schema: compact kop 56, lijnrij 60, platte status 56, vaste tijd/rail 68/28", () => {
  for (const re of [/kop: \{ height: 56,/, /lijnrij: \{ height: 60,/, /status: \{ height: 56, backgroundColor: P\.strip,/, /width: 68/, /rail: \{ width: 28/, /height: 44/, /height: 32/]) {
    assert.match(screen + stopScreen, re);
  }
  assert.equal(RITV2.navy, "#0A3A7A");
  assert.equal(RITV2.blue, "#0B57D0");
  assert.equal(RITV2.info, "#E8F0FE");
});

test("Names lose duplicate city prefixes only; city reappears only on change", () => {
  assert.equal(compacteHalteNaam("Amsterdam, Beukenweg", "Amsterdam"), "Beukenweg");
  assert.equal(compacteHalteNaam("Zaandam, De Vlinder", "Zaandam"), "De Vlinder");
  assert.equal(compacteHalteNaam("Amsterdam Centraal", "Amsterdam"), "Amsterdam Centraal");
  assert.equal(compacteHalteNaam("Haarlem", "Amsterdam"), "Haarlem");
  const rows = bouwRitV2Haltes(rit, null);
  assert.deepEqual(rows.map(r => r.toonPlaats), [true, false, false, true]);
  assert.deepEqual(rows.map(r => r.naam), ["Beukenweg", "Alexanderplein", "Plantage Lepellaan", "Station"]);
  assert.doesNotMatch(stopScreen, /emoji/);
});

test("Delay continues over later unsupplied stops until a live recovery of zero", () => {
  const rows = bouwRitV2Haltes(rit, null);
  assert.equal(rows[0].vertragingMin, 2);
  assert.equal(rows[0].verwacht, "02:13");
  assert.equal(rows[1].verwacht, "02:15");
  assert.equal(rows[1].vertragingMin, 2);
  assert.equal(rows[1].verwachtMs, 1794186780000 + 120000);
  assert.equal(rows[2].verwacht, "02:15");
  assert.equal(rows[2].vertragingMin, 0);
  assert.equal(rows[3].vertragingMin, 0);
  assert.equal(telKlokMinuten("23:59", 3), "00:02");
  assert.equal(verwachteAankomstMin(2_000_000, 1_940_000), 1);
});

test("Already propagated server delay is not added twice", () => {
  const r = JSON.parse(JSON.stringify(rit));
  r.haltes[1].live_tijd = false;
  r.haltes[1].vertraging_min = 2;
  r.haltes[1].verwacht = "02:15";
  r.haltes[1].tijd_ms = 1794186900000;
  const rows = bouwRitV2Haltes(r, null);
  assert.equal(rows[1].verwacht, "02:15");
  assert.equal(rows[1].verwachtMs, 1794186900000);
  assert.equal(rows[2].vertragingMin, 0);
});

test("Real GPS determines progress on the matching segment and not from clock times", () => {
  const gps = { lat: 52.36, lon: 4.901 };
  const seg = projecteerGpsOpRit(rit, gps);
  assert.equal(seg.vorigeIndex, 0);
  assert.equal(seg.volgendeIndex, 1);
  assert.ok(Math.abs(seg.fractie - .5) < .03);
  assert.equal(projecteerGpsOpRit(rit, { lat: 53.99, lon: 6 }), null);
  const noGeometry = { ...rit, stops: [] };
  assert.equal(projecteerGpsOpRit(noGeometry, gps), null);
});

test("Stale GPS receives grey chip, vehicle marker only with current projected GPS", () => {
  const now = 1794186780000;
  assert.equal(isGpsActueel({ timestamp: now / 1000 - 30, leeftijd_s: 30 }, now), true);
  assert.equal(isGpsActueel({ timestamp: now / 1000 - 46, leeftijd_s: 46 }, now), false);
  assert.equal(isGpsActueel({ timestamp: now / 1000 - 5, leeftijd_s: 5 }, now, true), false);
  assert.equal(isGpsActueel(null, now), false);
  assert.match(screen, /\(\) => rit && actueel && !rit\.vervallen/);
  assert.match(screen, /projecteerGpsOpRit\(rit, gps\)/);
  assert.match(screen, /chip=\{nogNietVertrokken \? "Geen voertuig-GPS" : !trein \? gpsStatus/);
  assert.match(screen, /segment && actueel && rijdend && r.index === segment.volgendeIndex/);
  assert.match(marker, /Animated\.timing\(beweging/);
  assert.doesNotMatch(marker, /Date\.now\(\)|volgendeMs/);
});

test("No pull to refresh, auto polling, footer data age, one passed stop and future collapse", () => {
  assert.doesNotMatch(screen, /RefreshControl|onRefresh/);
  assert.match(screen, /usePolling\(/);
  assert.match(screen, /api\.liveRitVoertuig\(rit\.id, rit\.datum\)/);
  assert.match(api, /get<LiveRitVoertuigAntwoord>/);
  assert.match(screen, /richtIndex - 1/);
  assert.match(screen, /zichtbaarKomendeHaltes\(/);
  assert.match(screen, /richtIndex \+ aantalKomende/);
  assert.match(screen, /<LiveBalk live=\{liveVoorBalk\}/);
  assert.match(screen, /<OnderBalk actief=\{van\} \/>/);
  assert.match(nav, /compact \? 64 : 62/);
});

test("No incidents are injected into the journey list", () => {
  assert.doesNotMatch(screen, /StoringKaart|storingen\.map/);
  assert.match(screen, /<LiveRitKaart/);
  assert.match(screen, /<FeedbackModal/);
  assert.match(screen, /<RitverloopStop/);
});
