import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app/rit.tsx", import.meta.url), "utf8");
const kaart = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");

test("Segment-toggle Lijst/Kaart bovenin rit; list zichtbaar als default en kaart alleen bij geschikte rit", () => {
  assert.match(app, /useState<"lijst" \| "kaart">\("lijst"\)/);
  assert.match(app, /<Text[^>]*>Lijst<\/Text>/);
  assert.match(app, /<Text[^>]*>Kaart<\/Text>/);
  assert.match(app, /name="list-outline"/);
  assert.match(app, /name="map-outline"/);
  assert.match(app, /setWeergave\("lijst"\)/);
  assert.match(app, /setWeergave\("kaart"\)/);
  assert.match(app, /kaartBeschikbaar = !!rit && !trein && !rit\.vervallen/);
  assert.match(app, /if \(!kaartBeschikbaar && weergave === "kaart"\) setWeergave\("lijst"\)/);
});

test("Kaart is full-screen binnen ritweergave, zonder inline kaart of onderste tabbar", () => {
  assert.match(app, /\{isKaart && rit \? \(\s*<LiveRitKaart/);
  assert.match(app, /\{!isKaart \? \(\s*<ScrollView/);
  assert.match(app, /\{!isKaart \? <OnderBalk actief=\{van\} \/>/);
  assert.match(kaart, /scherm: \{ flex: 1, overflow: "hidden" \}/);
  assert.match(kaart, /provider=\{PROVIDER_GOOGLE\}/);
  assert.match(kaart, /style=\{StyleSheet\.absoluteFill\}/);
  assert.match(kaart, /scrollEnabled=\{true\}/);
  assert.match(kaart, /zoomEnabled=\{true\}/);
  assert.doesNotMatch(kaart, /height: 250|UrlTile|TegelKaart|tile\.openstreetmap/);
});

test("Zwevende ritstatus, vertraging, terug naar lijst en hercentreerknop zijn gekoppeld", () => {
  assert.match(kaart, /Onderweg naar \$\{volgendeHalte/);
  assert.match(kaart, /\+\{vertragingMin\} min/);
  assert.match(kaart, /Nog geen bevestigde voertuiglocatie/);
  assert.match(kaart, /statusKaart: \{\s*position: "absolute"/);
  assert.match(kaart, /accessibilityLabel="Terug naar de haltelijst"/);
  assert.match(kaart, /onPress=\{onLijst\}/);
  assert.match(kaart, /accessibilityLabel="Centreer kaart op live voertuig"/);
  assert.match(kaart, /onPress=\{centreerVoertuig\}/);
  assert.match(kaart, /mapRef\.current\?\.animateToRegion\(voertuigRegio\(positie\), 550\)/);
});

test("Realtime coördinaten: vier seconden animatie, richting en lijnbadge, polling opruimen", () => {
  assert.match(kaart, /duration: duur/);
  assert.match(kaart, /useNativeDriver: false/);
  assert.match(kaart, /<Marker\.Animated/);
  assert.match(kaart, /flat=\{true\}/);
  assert.match(kaart, /rotation=\{positie\.richting \?\? 0\}/);
  assert.match(kaart, /\{lijnnummer \|\| positie\.lijnnummer\}/);
  assert.match(kaart, /setInterval\(\(\) => void ophalen\(\), LIVE_MAP_POLL_MS\)/);
  assert.match(kaart, /clearInterval\(interval\)/);
  assert.match(kaart, /gesloten = true/);
  assert.match(kaart, /console\.error\("\[LiveRitKaart\] Native Google Maps-animatie mislukt"/);
  assert.match(kaart, /onPanDrag=\{\(\) => \{ volgVoertuig\.current = false; \}\}/);
});
