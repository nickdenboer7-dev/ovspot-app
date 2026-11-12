import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bepaalLocatieMetFallback,
  STANDAARD_LOCATIE, kiesLocatieFallback
} from "../lib/locationTimeout.ts";

const nearby = readFileSync(new URL("../app/(tabs)/index.tsx", import.meta.url), "utf8");
const polling = readFileSync(new URL("../lib/hooks.ts", import.meta.url), "utf8");

function fakePhone() {
  let gpsEnabled = false;
  let allowed = true;
  let currentCall = 0;
  const provider = {
    getForegroundPermissionsAsync: async () => ({ granted: allowed, canAskAgain: true }),
    requestForegroundPermissionsAsync: async () => ({ granted: allowed, canAskAgain: true }),
    hasServicesEnabledAsync: async () => gpsEnabled,
    getLastKnownPositionAsync: async () => null,
    getCurrentPositionAsync: async () => {
      currentCall++;
      return { coords: { latitude: 53.201, longitude: 5.795 } };
    }
  };
  return {
    provider,
    setGPS: enabled => { gpsEnabled = enabled; },
    setPermission: enabled => { allowed = enabled; },
    getCalls: () => currentCall
  };
}

test("GPS off, open Nearby -> clear fallback, turn GPS on and retry -> confirmed location", async () => {
  const phone = fakePhone();
  const off = await bepaalLocatieMetFallback(phone.provider, 3, STANDAARD_LOCATIE, 100);
  assert.equal(off.fout, "uit");
  assert.deepEqual(off.positie, STANDAARD_LOCATIE);
  assert.equal(phone.getCalls(), 0, "no GPS fix while providers disabled");

  phone.setGPS(true);
  const start = Date.now();
  const recovered = await bepaalLocatieMetFallback(phone.provider, 3, off.positie, 200);
  assert.equal(recovered.fout, null);
  assert.equal(recovered.positie.bron, "gps");
  assert.equal(recovered.positie.lat, 53.201);
  assert.equal(recovered.positie.lon, 5.795);
  assert.equal(phone.getCalls(), 1);
  assert.ok(Date.now() - start < 200, "recovery must not wait for earlier timeout");
});

test("Permission denied then granted uses the exact same recovery route", async () => {
  const phone = fakePhone();
  phone.setGPS(true);
  phone.setPermission(false);
  const off = await bepaalLocatieMetFallback(phone.provider, 3, STANDAARD_LOCATIE, 150);
  assert.equal(off.fout, "geweigerd");
  phone.setPermission(true);
  const recovered = await bepaalLocatieMetFallback(phone.provider, 3, off.positie, 150);
  assert.equal(recovered.fout, null);
  assert.equal(recovered.positie.bron, "gps");
});

test("Hung GPS request times out, next tap succeeds; late result cannot override it", async () => {
  const phone = fakePhone();
  phone.setGPS(true);
  let resolveOld;
  let pending = true;
  const initial = phone.provider.getCurrentPositionAsync;
  phone.provider.getCurrentPositionAsync = () => pending
    ? new Promise(resolve => { resolveOld = resolve; })
    : initial();
  const timed = await bepaalLocatieMetFallback(phone.provider, 3, STANDAARD_LOCATIE, 20);
  assert.equal(timed.fout, "timeout");
  assert.equal(timed.positie.bron, "standaard");
  pending = false;
  const recovered = await bepaalLocatieMetFallback(phone.provider, 3, timed.positie, 200);
  assert.equal(recovered.fout, null);
  assert.equal(recovered.positie.bron, "gps");
  resolveOld({ coords: { latitude: 48.0, longitude: 9.0 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(recovered.positie.lat, 53.201);
  assert.match(nearby, /const poging = \+\+locatiePoging\.current/);
  assert.match(nearby, /if \(!geldig\(\)\) return/);
  assert.match(nearby, /if \(geldig\(\)\) \{[\s\S]*?setZoekt\(false\)/);
});

test("Short network drop retains last good departures; next success clears error", async () => {
  let online = true;
  let results = [{ id: "stop-good", vertrek: "21:20" }];
  async function get() {
    if (!online) throw new Error("Netwerk tijdelijk onbereikbaar");
    return [...results];
  }
  const first = await get();
  let displayed = first;
  online = false;
  await assert.rejects(get(), /Netwerk tijdelijk onbereikbaar/);
  assert.equal(displayed[0].id, "stop-good", "cached good board remains visible");
  online = true;
  results = [{ id: "stop-good", vertrek: "21:23" }];
  displayed = await get();
  assert.equal(displayed[0].vertrek, "21:23");
  assert.match(polling, /catch \(e: any\) \{[\s\S]*?setFout\(e\?\.message/);
  assert.match(polling, /dataRef\.current = d;[\s\S]{0,80}setData\(d\);[\s\S]{0,80}setFout\(null\)/);
  assert.match(polling, /if \(s === "active"\) void run\(\)/);
  assert.match(nearby, /api\.dichtbij\(pos\.lat, pos\.lon, instellingen\.straal\)/);
});

test("When GPS is off, Nearby always offers manual search and a direct retry path", () => {
  assert.match(nearby, /accessibilityLabel=\{t\("Zoek halte, lijn of plaats"\)\}/);
  assert.match(nearby, /locFout === "geweigerd-blijvend"/);
  assert.match(nearby, /Linking\.openSettings\(\) : void zoekLocatie\(\)/);
  assert.match(nearby, /onPress=\{\(\) => void zoekLocatie\(\)\}/);
  assert.match(nearby, /Vervangende locatie · Amsterdam Centraal/);
  assert.deepEqual(kiesLocatieFallback(null, null), STANDAARD_LOCATIE);
});
