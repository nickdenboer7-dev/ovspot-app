import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const code = readFileSync(new URL("../lib/ritTimelineProgress.ts", import.meta.url), "utf8");
const screen = readFileSync(new URL("../app/rit.tsx", import.meta.url), "utf8");
const movingBus = readFileSync(new URL("../components/RijdendVoertuig.tsx", import.meta.url), "utf8");

const cjs = ts.transpileModule(code, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020
}}).outputText;
const exports = {};
vm.runInNewContext(cjs, { exports, Date, Math, Number, RegExp, String,
  require: (id) => {
    if (id === "./wayfindingV2") return {
      positieBevestigd: r => (r.live_positie === true || r.positie_betrouwbaar === true) && !!r.nu_hier
    };
    throw Error("Unexpected runtime module: " + id);
  }
});
const { berekenTussenHalteVoortgang } = exports;

const nu = new Date("2026-11-09T01:18:30+01:00").getTime();
const basis = {
  live: true, vervallen: false, datum: "2026-11-09", modus: "bus",
  positie_betrouwbaar: true, rit_status: "DRIVING",
  nu_hier: { bij_halte: false, na_index: 0, volgende_index: 1, over_min: 1, gps_leeftijd_s: 12 },
  haltes: [
    { id: "a", naam: "De Vlinder", status: "geweest", state: "PASSED", vertrek: "01:18", tijd_ms: nu - 30_000, vervalt: false },
    { id: "b", naam: "Weerpad/Wachterstraat", status: "komt", state: "APPROACHING", aankomst: "01:19", tijd_ms: nu + 30_000, vervalt: false }
  ]
};
const copie = v => JSON.parse(JSON.stringify(v));

test("Confirmed moving bus is interpolated on the correct pair, with ETA", () => {
  const result = berekenTussenHalteVoortgang(basis, nu);
  assert.equal(result.vorigeIndex, 0);
  assert.equal(result.volgendeIndex, 1);
  assert.equal(result.voortgang, 0.5);
  assert.equal(result.resterendMin, 1);
  assert.equal(result.volgendeMs, nu + 30_000);
});

test("Progress is clamped and never drawn outside the stop segment", () => {
  assert.equal(berekenTussenHalteVoortgang(basis, nu - 29_000).voortgang, 0.05);
  assert.equal(berekenTussenHalteVoortgang(basis, nu + 29_000).voortgang, 0.95);
});

test("Without confirmed GPS or with stale GPS no exact-looking bus marker appears", () => {
  for (const changes of [
    { positie_betrouwbaar: false },
    { live: false },
    { vervallen: true },
    { rit_status: "INCOMING" }
  ]) {
    assert.equal(berekenTussenHalteVoortgang({ ...basis, ...changes }, nu), null);
  }
  const old = copie(basis); old.nu_hier.gps_leeftijd_s = 150;
  assert.equal(berekenTussenHalteVoortgang(old, nu), null);
});

test("At a stop, nonadjacent stop sequence or cancelled next stop: no traveling icon", () => {
  const at = copie(basis); at.nu_hier.bij_halte = true;
  assert.equal(berekenTussenHalteVoortgang(at, nu), null);
  const wrong = copie(basis); wrong.nu_hier.volgende_index = 0;
  assert.equal(berekenTussenHalteVoortgang(wrong, nu), null);
  const cancelled = copie(basis); cancelled.haltes[1].vervalt = true;
  assert.equal(berekenTussenHalteVoortgang(cancelled, nu), null);
});

test("Across midnight, a valid timetable fallback places the bus on the right link", () => {
  const r = copie(basis);
  r.haltes[0].tijd_ms = null; r.haltes[1].tijd_ms = null;
  r.haltes[0].vertrek = "23:58"; r.haltes[1].aankomst = "00:02";
  const at = new Date("2026-11-09T23:59:00").getTime();
  const progress = berekenTussenHalteVoortgang(r, at);
  assert.ok(progress);
  assert.equal(progress.voortgang, 0.25);
});

test("No bogus fraction when both stop times are unavailable or implausible", () => {
  const x = copie(basis);
  x.haltes[0].tijd_ms = null; x.haltes[1].tijd_ms = null;
  x.haltes[0].vertrek = ""; x.haltes[1].aankomst = "";
  assert.equal(berekenTussenHalteVoortgang(x, nu), null);
  const y = copie(basis); y.haltes[1].tijd_ms = nu + 3 * 3600_000;
  assert.equal(berekenTussenHalteVoortgang(y, nu), null);
});

test("New UI keeps the bus on the rail and next-stop status on the row", () => {
  const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
  const modern = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  assert.match(stop,/<RijdendVoertuig/);
  assert.match(stop,/t\("Volgende halte"\)/);
  assert.match(modern,/projecteerGpsOpRit\(rit, gps\)/);
  assert.match(movingBus,/Animated\.timing\(beweging/);
  assert.match(movingBus,/backgroundColor: geredenKleur/);
  assert.match(movingBus,/backgroundColor: teRijdenKleur/);
  assert.match(movingBus,/top: -vorigeHoogte \/ 2/);
  assert.doesNotMatch(movingBus,/Date\.now\(\)|volgendeMs/);
});

test("Header only names previous and next real stops for an actively tracked vehicle", () => {
  const route = exports.bepaalRitTraject(basis);
  assert.equal(route.van, "De Vlinder");
  assert.equal(route.naar, "Weerpad/Wachterstraat");
  assert.equal(route.vorigeIndex, 0);
  assert.equal(route.volgendeIndex, 1);
});

test("Header does not claim a location for KV8-only, stale GPS, arrived or invalid stop links", () => {
  const scenarios = [];
  const kv8 = copie(basis); kv8.positie_betrouwbaar = false; scenarios.push(kv8);
  const stale = copie(basis); stale.nu_hier.gps_leeftijd_s = 150; scenarios.push(stale);
  const arrived = copie(basis); arrived.rit_status = "ARRIVED"; arrived.nu_hier.bij_halte = true; scenarios.push(arrived);
  const incoming = copie(basis); incoming.rit_status = "INCOMING"; scenarios.push(incoming);
  const skip = copie(basis); skip.nu_hier.volgende_index = 4; scenarios.push(skip);
  const same = copie(basis); same.haltes[1].naam = "De Vlinder"; scenarios.push(same);
  const missing = copie(basis); missing.haltes[0].naam = ""; scenarios.push(missing);
  for (const scenario of scenarios) assert.equal(exports.bepaalRitTraject(scenario), null);
});

test("Header can name confirmed stop pair when timetable timestamps are temporarily missing", () => {
  const route = copie(basis);
  route.haltes[0].tijd_ms = null;
  route.haltes[1].tijd_ms = null;
  assert.equal(exports.bepaalRitTraject(route).naar, "Weerpad/Wachterstraat");
  assert.equal(berekenTussenHalteVoortgang(route, nu)?.volgendeIndex, 1);
});

test("New status strip has current GPS and two stop names without overlap", () => {
  const modern = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  assert.match(modern,/const paar = segment && haltes\[segment\.vorigeIndex\]/);
  assert.match(modern,/t\("Tussen"\) \+ " " \+ paar/);
  assert.match(modern,/rit\.vertraging_min > 0/);
  assert.match(modern,/actueel \? t\("GPS actueel"\) : t\("GPS verouderd"\)/);
  assert.match(modern,/status: \{ minHeight: 56/);
  assert.match(modern,/GPS verouderd/);
});
