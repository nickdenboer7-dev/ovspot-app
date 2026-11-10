import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  afwijkingTekst, bouwRitV2Haltes, isGpsActueel, projecteerGpsOpRit,
  rondAfwijkingMinuten, volgendeHalteTekst, verwachteAankomstMin,
  zichtbaarKomendeHaltes, RITV2
} from "../lib/ritverloopV2.ts";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const row = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
const timecell = readFileSync(new URL("../components/RitTijdcel.tsx", import.meta.url), "utf8");
const moving = readFileSync(new URL("../components/RijdendVoertuig.tsx", import.meta.url), "utf8");
const epoch = clock => new Date("2026-11-09T" + clock + "+01:00").getTime();
const stop = (name, planned, expected, live, delay = 0) => ({
  id: name, naam: "Amsterdam, " + name, plaats: "Amsterdam", gepland: planned,
  verwacht: expected.slice(0, 5), tijd_ms: epoch(expected), live_tijd: live,
  vertraging_min: delay, status: "komt", vervalt: false
});

/** Synthetic regression illustrating the reported N85 inconsistency, not a
 * claim that 04:xx were the real N85 passage times or a live feed snapshot.
 */
const n85 = {
  id: "test-n85", lijn: "N85", datum: "2026-11-09", live: true,
  vertraging_min: 2, // deliberately different from the NEXT stop: current old bug
  haltes: [
    { ...stop("De Zedde", "04:03", "04:03:00", true, 0), status: "geweest" },
    stop("Lagedijk", "04:05", "04:06:20", true, 1),
    stop("Volgende", "04:07", "04:07:00", false, 0),
    stop("Daarna", "04:09", "04:11:10", true, 2)
  ],
  stops: [
    { stop_id: "De Zedde", stop_sequence: 1, latitude: 52.5, longitude: 5.0 },
    { stop_id: "Lagedijk", stop_sequence: 2, latitude: 52.5, longitude: 5.002 },
    { stop_id: "Volgende", stop_sequence: 3, latitude: 52.5, longitude: 5.005 },
    { stop_id: "Daarna", stop_sequence: 4, latitude: 52.5, longitude: 5.007 }
  ]
};

test("N85 synthetic: route reports +2, but status uses next stop +1 exactly", () => {
  const rows = bouwRitV2Haltes(n85, 0);
  const next = rows[1];
  assert.equal(n85.vertraging_min, 2);
  assert.equal(next.vertragingSec, 80);
  assert.equal(next.vertragingMin, 1);
  assert.equal(afwijkingTekst(next.vertragingMin), "+1 min");
  assert.equal(rows[2].vertragingSec, 80);
  assert.equal(rows[2].vertragingMin, 1);
  assert.equal(rows[3].vertragingMin, 2);
  assert.match(screen, /const statusAfwijkingMin = rit\?\.live && volgendeRij/);
  assert.match(screen, /volgendeRij\.vertragingMin/);
  assert.doesNotMatch(screen, /rit\.vertraging_min === 0 \? t\("Op tijd"\)/);
});

test("80 seconds rounds ONCE to +1 minute and displays expected 04:06", () => {
  assert.equal(rondAfwijkingMinuten(80), 1);
  assert.equal(rondAfwijkingMinuten(89), 1);
  assert.equal(rondAfwijkingMinuten(90), 2);
  const rows = bouwRitV2Haltes(n85, 0);
  assert.equal(rows[1].gepland, "04:05");
  assert.equal(rows[1].verwacht, "04:06");
  assert.equal(rows[1].verwachtMs, epoch("04:06:20"));
});

test("20 seconds to next stop is 'aankomend', never 'over 0 min'", () => {
  const expected = epoch("04:06:20");
  const now = epoch("04:06:00");
  assert.equal(verwachteAankomstMin(expected, now), 0);
  assert.equal(volgendeHalteTekst(expected, now), "Volgende halte · aankomend");
  assert.equal(volgendeHalteTekst(expected, epoch("04:05:20")), "Volgende halte · over 1 min");
  assert.doesNotMatch(volgendeHalteTekst(expected, now), /over 0 min/);
  assert.match(row, /volgendeHalteTekst\(verwachtMs, nu, t\)/);
});

test("Early -80 sec displays '1 min te vroeg' with purple warning and struck plan", () => {
  const early = { ...n85, haltes: [
    { ...stop("Lagedijk", "04:05", "04:03:40", true, -1) }
  ] };
  const rows = bouwRitV2Haltes(early, null);
  assert.equal(rows[0].vertragingSec, -80);
  assert.equal(rows[0].vertragingMin, -1);
  assert.equal(rows[0].verwacht, "04:04");
  assert.equal(afwijkingTekst(-1), "1 min te vroeg");
  assert.equal(RITV2.early, "#8A3E91");
  assert.notEqual(RITV2.early, RITV2.green);
  assert.match(row, /s\.earlyText/);
  assert.match(timecell, /\{gewijzigd \? \(/);
  assert.match(timecell, /textDecorationLine: "line-through"/);
  assert.match(screen, /afwijkingMin=\{statusAfwijkingMin \?\? 0\}/);
});

test("More available viewport height yields more stops while never fewer than six", () => {
  assert.equal(zichtbaarKomendeHaltes(290, true, true), 6);
  assert.equal(zichtbaarKomendeHaltes(460, true, true), 6);
  assert.equal(zichtbaarKomendeHaltes(550, true, true), 8);
  assert.equal(zichtbaarKomendeHaltes(720, true, true), 11);
  assert.ok(zichtbaarKomendeHaltes(720, true, true) >
    zichtbaarKomendeHaltes(460, true, true));
  const used = h => {
    const upcoming = zichtbaarKomendeHaltes(h, true, true);
    return 64 + 48 + 44 + 44 + 8 + (upcoming - 1) * 48;
  };
  assert.ok(550 - used(550) < 48);
  assert.ok(720 - used(720) < 48);
  assert.match(screen, /setLijstHoogte\(/);
  assert.match(screen, /richtIndex \+ aantalKomende/);
  assert.match(screen, /<HalteVouwknop label=\{t\("Toon"\) \+ " " \+ verborgenLater/);
});

test("GPS current chip and marker are both gated on matched real coordinates", () => {
  const now = epoch("04:05:00");
  const current = { lat: 52.5, lon: 5.001,
    timestamp: now / 1000 - 10, leeftijd_s: 10 };
  const stale = { ...current, timestamp: now / 1000 - 50, leeftijd_s: 50 };
  const result = projecteerGpsOpRit(n85, current);
  assert.ok(result);
  assert.equal(result.vorigeIndex, 0);
  assert.equal(result.volgendeIndex, 1);
  assert.ok(Math.abs(result.fractie - .5) < .03);
  assert.equal(isGpsActueel(current, now), true);
  assert.equal(isGpsActueel(stale, now), false);
  assert.match(screen, /chip=\{nogNietVertrokken \? "Geen voertuig-GPS" : !trein \? gpsStatus/);
  assert.match(screen, /segment && actueel && rijdend && r.index === segment.volgendeIndex/);
  assert.doesNotMatch(moving, /volgendeMs|Date\.now\(\)/);
});

test("New shared status card retains precise live time, no incident injection", () => {
  assert.match(screen, /<StatusStrook/);
  assert.doesNotMatch(screen, /<View style=\{s\.statusBus\}|<View style=\{s\.statusScheiding\}/);
  assert.doesNotMatch(screen, /StoringKaart|storingen\.map/);
  assert.match(screen, /<OnderBalk actief=\{van\} \/>/);
});
