import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const rit = readFileSync(new URL("../app/rit.tsx", import.meta.url), "utf8");
const kaart = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");

test("Header vervangt het tandwiel door precies één kaart-of-lijstknop zonder toggle-balk", () => {
  assert.match(rit, /kaartBeschikbaar \? \(\s*<Pressable[\s\S]*?onPress=\{\(\) => setWeergave\(isKaart \? "lijst" : "kaart"\)\}/);
  assert.match(rit, /name=\{isKaart \? "list-outline" : "map-outline"\}/);
  assert.doesNotMatch(rit, /settings-outline|router\.push\("\/instellingen"\)|weergaveRij|weergaveKeuze|weergaveKnop|weergaveTekst/);
  assert.match(rit, /\{isKaart && rit \? \(\s*<LiveRitKaart/);
});

test("Eerstvolgende halte heeft zachte highlight zonder dubbel blauw label", () => {
  assert.match(rit, /const eerstvolgendeIndex = nh && nh\.volgende_index/);
  assert.match(rit, /const eersteVolgende = i === eerstvolgendeIndex && !geweest && !h\.vervalt/);
  assert.match(rit, /eersteVolgende \? \{ backgroundColor: colors\.infoBg, borderRadius: 12 \} : null/);
  assert.doesNotMatch(rit, /nuTitelKlein|Volgende halte \(KV8\)|naderend && bevestigd \? "Volgende halte"/);
  // De aparte Nu-hier-rij is vervangen door een geanimeerd icoon op de echte rail.
  assert.doesNotMatch(rit, /r\.soort === "nu"|rijen\.push\(\{ soort: "nu" \}\)/);
  assert.match(rit, /<RijdendVoertuig/);
  assert.match(rit, /\{t\("Onderweg"\)\}/);
});

test("Per-halte vertraging als compacte +1 direct achter de tijd", () => {
  assert.match(rit, /<View style=\{s\.tijdRij\}>/);
  assert.match(rit, /\{vertraagd && !h\.vervalt \? \(\s*<Text style=\{\[s\.tijdVertraging, \{ color: colors\.delay \}\]\}>\+\{h\.vertraging_min\}<\/Text>/);
  assert.match(rit, /tijdRij: \{ flexDirection: "row", alignItems: "baseline", gap: 4 \}/);
});

test("Statuskaart toont altijd een compacte groene Op tijd-badge bij nul vertraging", () => {
  assert.match(kaart, /\{Number\.isFinite\(vertragingMin\) \? \(/);
  assert.match(kaart, /vertragingMin === 0 \? "Op tijd"/);
  assert.match(kaart, /backgroundColor: vertragingMin > 0 \? colors\.warnBg : colors\.liveGlow/);
  assert.match(kaart, /color: vertragingMin > 0 \? colors\.delay : colors\.live/);
  assert.match(kaart, /punctualiteitBadge:/);
});

test("Meedraaiend snaveltje heeft een witte outline op donker tracé", () => {
  assert.match(kaart, /<View style=\{s\.snavelRand\} \/>/);
  assert.match(kaart, /snavelRand: \{[\s\S]*?borderBottomColor: "#FFFFFF"/);
  assert.match(kaart, /borderColor: "#FFFFFF"/);
  assert.match(kaart, /rotation=\{heading\}/);
  assert.match(kaart, /flat=\{true\}/);
});
