import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
const motion = readFileSync(new URL("../components/RijdendVoertuig.tsx", import.meta.url), "utf8");

test("GTFS-haltenaam wordt niet willekeurig afgeknipt: alleen plaats-prefix wordt verwijderd", () => {
  assert.match(stop, /\{zichtbaarNaam\}/);
  assert.match(stop, /numberOfLines=\{1\}/);
  assert.doesNotMatch(stop, /naam\.slice\(|naam\.substring\(|truncat/);
  assert.match(screen, /compacteHalteNaam\(/);
});

test("Naamkolom neemt beschikbare breedte zonder 52px spoorreserve", () => {
  assert.match(stop, /labelColumn: \{ flex: 1, minWidth: 0/);
  assert.doesNotMatch(stop, /minWidth: 52|width: 210/);
  assert.match(stop, /name: \{ fontSize: 13, fontWeight: "600" \}/);
});

test("Nieuwe compacte lijst reserveert geen ruimte voor een ongebruikte perronkolom", () => {
  assert.match(stop, /timeColumn: \{ width: 68/);
  assert.match(stop, /rail: \{ width: 28/);
  assert.doesNotMatch(stop, /spoor && trein|s\.spoor/);
});
