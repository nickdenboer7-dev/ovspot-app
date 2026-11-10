import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app/rit.tsx", import.meta.url), "utf8");
const kaart = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");

test("Kop en lijnrij hebben overzichtelijke kaart/lijstwissel", () => {
  const modern = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  assert.match(modern,/useState<"lijst" \| "kaart">\("lijst"\)/);
  assert.match(modern,/kaartBeschikbaar = !!rit && !trein && !rit\.vervallen/);
  assert.match(modern,/onPress=\{\(\) => setWeergave\(isKaart \? "lijst" : "kaart"\)\}/);
  assert.match(modern,/name=\{isKaart \? "list-outline" : "map-outline"\}/);
  assert.match(modern,/icon="ellipsis-vertical"/);
});

test("Kaart is full-screen en sluit compacte haltelijst/tabbar uit", () => {
  const modern = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  assert.match(modern,/!isKaart \? <>/);
  assert.match(modern,/<ScrollView ref=\{lijstRef\}/);
  assert.match(modern,/<LiveRitKaart/);
  assert.match(modern, /<OnderBalk actief=\{van\} \/>/);
  assert.match(kaart,/provider=\{PROVIDER_GOOGLE\}/);
  assert.match(kaart,/style=\{StyleSheet\.absoluteFill\}/);
  assert.doesNotMatch(kaart,/height: 250|UrlTile|tile\.openstreetmap/);
});

test("Zwevende ritstatus, vertraging, terug naar lijst en hercentreerknop zijn gekoppeld", () => {
  assert.match(kaart, /Onderweg naar \$\{volgendeHalte/);
  assert.match(kaart, /\+\$\{vertragingMin\} min/);
  assert.match(kaart, /Nog geen bevestigde voertuiglocatie/);
  assert.match(kaart, /statusKaart: \{\s*position: "absolute"/);
  assert.match(kaart, /accessibilityLabel=\{t\("Terug naar de haltelijst"\)\}/);
  assert.match(kaart, /onPress=\{onLijst\}/);
  assert.match(kaart, /accessibilityLabel=\{t\("Centreer kaart op live voertuig"\)\}/);
  assert.match(kaart, /onPress=\{centreerVoertuig\}/);
  assert.match(kaart, /mapRef\.current\?\.animateToRegion\(voertuigRegio\(positie\), 550\)/);
});

test("Realtime coördinaten: vier seconden animatie, richting en lijnbadge, polling opruimen", () => {
  assert.match(kaart, /duration: LIVE_MAP_ANIMATION_MS/);
  assert.match(kaart, /useNativeDriver: false/);
  assert.match(kaart, /<Marker\.Animated/);
  assert.match(kaart, /flat=\{true\}/);
  assert.match(kaart, /rotation=\{heading\}/);
  assert.match(kaart, /\{lijnnummer \|\| positie\.lijnnummer\}/);
  const parent = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  assert.match(parent, /instellingen\.databesparing \? 15000 : 5000/);
  assert.match(parent, /positie=\{actueel \? gps : null\}/);
  assert.match(kaart, /appStateListener\.remove\(\)/);
  assert.doesNotMatch(kaart, /setInterval\(\(\) => void ophalen/);
  assert.match(kaart, /console\.error\("\[LiveRitKaart\] Native Google Maps-animatie mislukt"/);
  assert.match(kaart, /onPanDrag=\{\(\) => \{ volgVoertuig\.current = false; \}\}/);
});
