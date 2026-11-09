import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { geldigeRitPositie, LIVE_MAP_ANIMATION_MS, LIVE_MAP_POLL_MS } from "../lib/liveRitKaart.ts";

const ritId = "gtfs/395732623", datum = "2026-11-07";
const basis = {
  ok: true, bron: "NDOV KV6posinfo", rit_id: ritId, datum,
  tijdstip: 1794100734, beschikbaar: true,
  voertuig: { voertuignummer: "CXX_9626", lijnnummer: "U405",
    lat: 52.028181, lon: 5.088946, timestamp: 1794100729,
    leeftijd_s: 5, richting: 116.9 }
};

test("Live positie alleen bij exacte rit en dienstdatum, niet een willekeurige lijnbus", () => {
  assert.deepEqual(geldigeRitPositie(basis, ritId, datum), basis.voertuig);
  assert.equal(geldigeRitPositie(basis, "gtfs/andere", datum), null);
  assert.equal(geldigeRitPositie(basis, ritId, "2026-11-08"), null);
  assert.equal(geldigeRitPositie({ ...basis, beschikbaar: false }, ritId, datum), null);
});

test("Stale of ongeldige GPS wordt niet op de kaart geprojecteerd", () => {
  const ongeldig = (change) => ({ ...basis, voertuig: { ...basis.voertuig, ...change } });
  assert.equal(geldigeRitPositie(ongeldig({ leeftijd_s: 181 }), ritId, datum), null);
  assert.equal(geldigeRitPositie(ongeldig({ lat: 0 }), ritId, datum), null);
  assert.equal(geldigeRitPositie(ongeldig({ lon: Number.NaN }), ritId, datum), null);
  assert.equal(geldigeRitPositie(ongeldig({ voertuignummer: "999" }), ritId, datum), null);
  assert.equal(geldigeRitPositie({ ...basis, voertuig: null }, ritId, datum), null);
  assert.equal(geldigeRitPositie(ongeldig({ richting: 450 }), ritId, datum)?.richting, 90);
});

test("De kaart update iedere 5 seconden en animeert posities in 4 seconden", () => {
  assert.equal(LIVE_MAP_POLL_MS, 5000);
  assert.equal(LIVE_MAP_ANIMATION_MS, 4000);
  const component = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");
  assert.match(component, /setInterval\(\(\) => void ophalen\(\),\s*instellingen\.databesparing \? 15_000 : LIVE_MAP_POLL_MS\)/);
  assert.match(component, /coordinate\.timing\(\{/);
  assert.match(component, /useNativeDriver: false/);
  assert.match(component, /<Marker\.Animated\s+coordinate=/);
  assert.match(component, /flat=\{true\}/);
  assert.match(component, /rotation=\{heading\}/);
  assert.match(component, /scherm: \{ flex: 1, overflow: "hidden" \}/);
});

test("Native Google Maps direct zonder versiecheck, stille fallback of OSM-tegels", () => {
  const component = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");
  assert.match(component, /import MapView, \{ AnimatedRegion, Marker, Polyline, PROVIDER_GOOGLE \} from "react-native-maps"/);
  assert.match(component, /<MapView\s+ref=\{mapRef\}[\s\S]*?provider=\{PROVIDER_GOOGLE\}/);
  assert.match(component, /<Marker\.Animated/);
  assert.match(component, /mapType="standard"/);
  assert.match(component, /console\.error\("\[LiveRitKaart\] Native Google Maps-animatie mislukt"/);
  assert.doesNotMatch(component, /nativeBuildVersion|nativeMaps\(|!maps|TegelKaart|UrlTile|tile\.openstreetmap\.org|Live kaart beschikbaar na installatie/);
});

test("Ritverloop heeft een keuzescherm voor de volledige kaart, zonder inline kaart", () => {
  const app = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  assert.match(app,/useState<"lijst" \| "kaart">\("lijst"\)/);
  assert.match(app,/kaartBeschikbaar = !!rit && !trein && !rit\.vervallen/);
  assert.match(app,/setWeergave\(isKaart \? "lijst" : "kaart"\)/);
  assert.match(app,/<LiveRitKaart/);
  assert.match(app,/<OnderBalk actief=\{van\} compact/);
  const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
  assert.match(api,/liveRitVoertuig: \(ritId: string, datum: string\)/);
  assert.match(api,/\/voertuig\?rit_id=/);
  assert.match(api,/API_V2_BASE/);
});
