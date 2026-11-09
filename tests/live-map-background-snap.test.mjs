import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  gpsAfstandMeter, moetVoertuigSnappen, LIVE_MAP_SNAP_DISTANCE_M,
  LIVE_MAP_SNAP_GAP_MS, LIVE_MAP_ANIMATION_MS
} from "../lib/liveRitKaart.ts";

const component = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");
const start = { lat: 53.17048, lon: 5.42507, timestamp: 1000 };
const vorige = { ...start, ontvangenMs: 4000 };

test("Kleine stappen animeren, afstand boven 180 m snapt direct", () => {
  assert.equal(LIVE_MAP_SNAP_DISTANCE_M, 180);
  assert.ok(gpsAfstandMeter(start, { lat: 53.17058, lon: start.lon }) > 10);
  assert.ok(gpsAfstandMeter(start, { lat: 53.17228, lon: start.lon }) > 180);
  assert.equal(moetVoertuigSnappen(vorige,
    { lat: 53.17058, lon: start.lon, timestamp: 1005 }, 9000), false);
  assert.equal(moetVoertuigSnappen(vorige,
    { lat: 53.17228, lon: start.lon, timestamp: 1005 }, 9000), true);
});

test("Eerste fix, hervatten of ontvangstgat >15 sec veroorzaakt harde snap", () => {
  assert.equal(LIVE_MAP_SNAP_GAP_MS, 15000);
  assert.equal(moetVoertuigSnappen(null, start, 4000), true);
  assert.equal(moetVoertuigSnappen(vorige, { ...start, timestamp: 1005 }, 9000, true), true);
  assert.equal(moetVoertuigSnappen(vorige, { ...start, timestamp: 1005 }, 19000), false);
  assert.equal(moetVoertuigSnappen(vorige, { ...start, timestamp: 1005 }, 19001), true);
  assert.equal(moetVoertuigSnappen(vorige, { ...start, timestamp: 1016 }, 9000), true);
  assert.equal(moetVoertuigSnappen(vorige, { ...start, timestamp: 999 }, 9000), true);
  assert.equal(moetVoertuigSnappen(vorige, { ...start, timestamp: 1005 }, 3000), true);
});

test("AppState triggert snap bij foreground en stopt animatie in achtergrond", () => {
  assert.match(component, /import \{ AppState, Pressable, StyleSheet, View \} from "react-native"/);
  assert.match(component, /import \{ Text \} from "\.\/LocalizedText"/);
  assert.match(component, /AppState\.addEventListener\("change", volgendeState => \{/);
  assert.match(component, /if \(volgendeState !== "active"\) \{[\s\S]*?skipAnimation\.current = true;[\s\S]*?coordinate\.stopAnimation/);
  assert.match(component, /if \(vorig !== "active"\) \{[\s\S]*?skipAnimation\.current = true;/);
  assert.match(component, /appStateListener\.remove\(\)/);
  const parent = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  const poll = readFileSync(new URL("../lib/hooks.ts", import.meta.url), "utf8");
  assert.match(parent, /const gpsPoll = usePolling/);
  assert.match(poll, /if \(s === "active"\) void run\(\)/);
  assert.doesNotMatch(component, /setInterval\(\(\) => void ophalen/);
});

test("Harde snap zonder timing, normale stap geanimeerd; camera snapt ook", () => {
  assert.equal(LIVE_MAP_ANIMATION_MS, 4000);
  assert.match(component, /moetVoertuigSnappen\(vorigeFix\.current, positie, ontvangenMs, skipAnimation\.current\)/);
  assert.match(component, /coordinate\.stopAnimation\(\(\) => \{\}\);\s*if \(snap\) \{/);
  assert.match(component, /coordinate\.setValue\(regio\)/);
  assert.match(component, /\} else \{\s*coordinate\.timing\(\{/);
  assert.match(component, /duration: LIVE_MAP_ANIMATION_MS/);
  assert.match(component, /mapRef\.current\?\.animateToRegion\(regio, snap \? 0 : LIVE_MAP_ANIMATION_MS\)/);
});
