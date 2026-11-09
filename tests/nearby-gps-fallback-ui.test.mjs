import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { STANDAARD_LOCATIE, kiesLocatieFallback } from "../lib/locationTimeout.ts";

const nearby = readFileSync(new URL("../app/(tabs)/index.tsx", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const js = ts.transpileModule(i18n, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020
} }).outputText;
const exports = {};
vm.runInNewContext(js, { exports, Intl, require: name => {
  if (name === "react-native") return {
    I18nManager: { getConstants: () => ({ localeIdentifier: "en_US" }) }
  };
  throw Error("Unexpected dependency: " + name);
}});
const t = exports.vertaling;
const banner = nearby.split('{pos?.bron === "standaard" ? (')[1]?.split(') : locFout && pos ? (')[0];

test("Amsterdam Centraal stays a location fallback, never falsely GPS", () => {
  assert.deepEqual(kiesLocatieFallback(null, null), STANDAARD_LOCATIE);
  assert.equal(STANDAARD_LOCATIE.bron, "standaard");
  assert.match(nearby, /pos\?\.bron === "standaard"/);
  assert.match(nearby, /"Haltes bij Amsterdam Centraal"/);
  assert.match(nearby, /pos && pos\.bron !== "standaard"/);
  assert.match(nearby, /locFout && pos/); // existing home / last-known path
});

test("Fallback is a persistent explanation, not a generic retrying error", () => {
  assert.ok(banner?.includes("fallbackKaart"), "separate information card");
  assert.match(banner, /Vervangende locatie · Amsterdam Centraal/);
  assert.match(banner, /Dit zijn haltes bij Amsterdam Centraal, niet bij jou in de buurt/);
  assert.doesNotMatch(banner, /<FoutBalk/);
  assert.match(nearby, /GPS niet beschikbaar\. Haltes bij je ingestelde thuislocatie/);
});

test("A single tap opens existing stop search, without changing the GPS coordinates", () => {
  assert.match(banner, /onPress=\{\(\) => router\.push\("\/zoek"\)\}/);
  assert.match(banner, /accessibilityLabel=\{t\("Andere halte zoeken"\)\}/);
  assert.match(banner, /Andere halte zoeken/);
  assert.match(nearby, /api\.dichtbij\(pos\.lat, pos\.lon, instellingen\.straal\)/);
  assert.doesNotMatch(banner, /setPos\(|STANDAARD_LOCATIE\s*=/);
});

test("Retry uses the existing GPS flow and disables double taps while loading", () => {
  assert.match(banner, /locFout === "geweigerd-blijvend"/);
  assert.match(banner, /Linking\.openSettings\(\) : void zoekLocatie\(\)/);
  assert.match(banner, /disabled=\{zoekt && locFout !== "geweigerd-blijvend"\}/);
  assert.match(banner, /zoekt \? "Locatie bepalen…" : "GPS opnieuw proberen"/);
  assert.match(nearby, /setLocFout\(fout\)/);
  assert.match(nearby, /setPos\(positie\)/);
});

test("Every fallback explanation and action has Dutch and English text", () => {
  const messages = [
    ["Haltes bij Amsterdam Centraal", "Stops near Amsterdam Centraal"],
    ["Vervangende locatie · Amsterdam Centraal", "Fallback location · Amsterdam Centraal"],
    ["Je locatie is niet beschikbaar. Dit zijn haltes bij Amsterdam Centraal, niet bij jou in de buurt.",
      "Location unavailable. These stops are near Amsterdam Centraal, not near your current location."],
    ["Andere halte zoeken", "Search another stop"],
    ["GPS opnieuw proberen", "Retry GPS"]
  ];
  for (const [nl, en] of messages) {
    assert.equal(t(nl, "en"), en);
    assert.equal(t(nl, "nl"), nl);
  }
});
