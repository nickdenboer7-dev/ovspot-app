import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const configure = require("../app.config.js");
const app = require("../app.json").expo;
const placeholder = "AIza" + "A".repeat(35);

test("Google Maps key wordt uit de buildomgeving in zowel Expo Android config als native plugin gezet", () => {
  const prev = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  try {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = placeholder;
    const conf = configure({ config: app });
    assert.equal(conf.android.config.googleMaps.apiKey, placeholder);
    const mapsPlugins = conf.plugins.filter(p => (typeof p === "string" ? p : p[0]) === "react-native-maps");
    assert.equal(mapsPlugins.length, 1);
    assert.equal(mapsPlugins[0][1].androidGoogleMapsApiKey, placeholder);
    assert.equal(conf.android.package, "nl.ovspot.app");
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    else process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = prev;
  }
});

test("Zonder sleutel wordt geen fictieve Google Maps API-key ingespoten", () => {
  const names = ["EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_API_KEY"];
  const prev = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    names.forEach(name => delete process.env[name]);
    const conf = configure({ config: app });
    assert.equal(conf.android.config?.googleMaps?.apiKey, undefined);
    const maps = conf.plugins.filter(p => (typeof p === "string" ? p : p[0]) === "react-native-maps");
    assert.equal(maps.length, 1);
    assert.equal(maps[0][1].androidGoogleMapsApiKey, undefined);
  } finally {
    names.forEach(name => prev[name] === undefined ? delete process.env[name] : process.env[name] = prev[name]);
  }
});

test("Sleutels met ongeldig formaat worden expliciet geweigerd", () => {
  const prev = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  try {
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = "NIET_EEN_GELDIGE_KEY";
    assert.throws(() => configure({ config: app }), /geen geldig formaat/);
  } finally {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    else process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = prev;
  }
});


test("EAS native build wordt geweigerd zonder geldige Google Maps sleutel", () => {
  const names = ["EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_API_KEY", "EAS_BUILD_PROFILE"];
  const prev = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    delete process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    process.env.EAS_BUILD_PROFILE = "preview";
    assert.throws(() => configure({ config: app }), /Google Maps API-key ontbreekt/);
  } finally {
    names.forEach(name => prev[name] === undefined ? delete process.env[name] : process.env[name] = prev[name]);
  }
});
test("OSM URL-/tegelrendering is verwijderd uit het live voertuigkaart-scherm", () => {
  const code = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(code, /tile\.openstreetmap|UrlTile|TegelKaart|new Image|worldPixels/);
  assert.match(code, /provider=\{PROVIDER_GOOGLE\}/);
  assert.match(code, /mapType="standard"/);
  assert.match(code, /<Marker\.Animated/);
  assert.match(code, /animateCamera/);
});
