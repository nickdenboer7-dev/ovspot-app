import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
const motion = readFileSync(new URL("../components/RijdendVoertuig.tsx", import.meta.url), "utf8");

test("OVspot-kop heeft favoriet en meer; kaartknop staat los in lijnrij", () => {
  assert.match(screen, /<KopKnop icon=\{fav \? "star" : "star-outline"\}/);
  assert.match(screen, /icon="ellipsis-vertical"/);
  assert.match(screen, /<View style=\{s\.lijnrij\}>/);
  assert.match(screen, /name=\{isKaart \? "list-outline" : "map-outline"\}/);
});

test("Volgende halte is blauw gemarkeerd zonder los Nu hier-blok", () => {
  assert.match(stop, /backgroundColor: volgende \? RITV2\.info/);
  assert.match(stop, /\{t\("Volgende halte"\)\}/);
  assert.doesNotMatch(screen, /rijen\.push\(\{ soort: "nu"/);
  assert.match(stop, /<RijdendVoertuig/);
});

test("Per-halte vertraging wordt compact achter tijd gezet", () => {
  assert.match(stop, /<Text style=\{s\.delay\}>\+\{vertragingMin\}/);
  assert.match(stop, /timeMain: \{ flexDirection: "row", gap: 3, alignItems: "baseline"/);
});

test("GPS bepaalt nog steeds de voertuigmarker, maar niet de statuschip", () => {
  assert.match(screen, /const segment = rit && actueel && !rit\.vervallen/);
  assert.doesNotMatch(screen, /<View style=\{\[s\.gpsChip/);
  assert.match(screen, /<LiveRitKaart/);
});
