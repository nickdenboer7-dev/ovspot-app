import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { geldigeRitPositie } from "../lib/liveRitKaart.ts";

const kaart = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");

test("Android vehicle-marker krijgt rastertijd en wordt daarna zuinig bijgewerkt", () => {
  assert.match(kaart, /const \[markerTracksViewChanges, setMarkerTracksViewChanges\] = useState\(true\)/);
  assert.match(kaart, /tracksViewChanges=\{markerTracksViewChanges\}/);
  assert.match(kaart, /setTimeout\(\(\) => setMarkerTracksViewChanges\(false\), 750\)/);
  assert.match(kaart, /clearTimeout\(snapshotTimer\)/);
  // Alleen haltedots gebruiken de statische rastercache.
  assert.match(kaart, /coordinate=\{\{ latitude: stop.latitude, longitude: stop.longitude \}\}[\s\S]*?tracksViewChanges=\{false\}/);
});

test("Voertuigmarker houdt vaste 48x48 container, gecentreerde 36px badge en richting-snavel", () => {
  assert.match(kaart, /voertuigMarkerContainer: \{ width: 48, height: 48, alignItems: "center", justifyContent: "center" \}/);
  assert.match(kaart, /richtingSnavel: \{[\s\S]*?left: 20, top: 0/);
  assert.match(kaart, /voertuigMarker: \{[\s\S]*?top: 6, left: 6,[\s\S]*?width: 36, height: 36, borderRadius: 18/);
  assert.match(kaart, /flat=\{true\}/);
  assert.match(kaart, /rotation=\{heading\}/);
  assert.match(kaart, /anchor=\{\{ x: 0.5, y: 0.5 \}\}/);
});

test("Alleen echte GPS, geen NaN- of null-coördinaten en veilige numerieke richting", () => {
  assert.match(kaart, /Number.isFinite\(positie\?\.lat\) && Number.isFinite\(positie\?\.lon\)/);
  assert.match(kaart, /\{positie && heeftGeldigeVoertuigPositie \? \(/);
  assert.match(kaart, /typeof positie\?\.richting === "number" && Number.isFinite\(positie.richting\)/);
  assert.match(kaart, /\? positie.richting : 0/);
  const voorbeeld = {
    ok: true, beschikbaar: true, rit_id: "gtfs/1", datum: "2026-11-08",
    voertuig: { voertuignummer: "CXX_123", lijnnummer: "71", lat: 53.1707,
      lon: 5.4251, leeftijd_s: 2, timestamp: 1794100734, richting: null }
  };
  assert.equal(geldigeRitPositie(voorbeeld, "gtfs/1", "2026-11-08")?.richting, null);
  assert.equal(geldigeRitPositie({...voorbeeld, voertuig:{...voorbeeld.voertuig,lon:NaN}}, "gtfs/1", "2026-11-08"), null);
});
