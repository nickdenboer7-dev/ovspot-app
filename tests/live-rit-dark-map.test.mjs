import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { darkMapStyle } from "../constants/darkMapStyle.ts";
import { ritRouteKleur, ritRouteKleurDonker } from "../lib/liveRitKaart.ts";

const kaart = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");

test("Google Maps volgt exact de centrale app-scheme en schakelt runtime tussen licht en donker", () => {
  assert.match(kaart, /const \{ colors, scheme, t \} = useApp\(\)/);
  assert.match(kaart, /const isDark = scheme === "dark"/);
  assert.match(kaart, /customMapStyle=\{isDark \? darkMapStyle : \[\]\}/);
  assert.match(kaart, /provider=\{PROVIDER_GOOGLE\}/);
  assert.ok(darkMapStyle.length >= 15);
  assert.ok(darkMapStyle.every(rule => Array.isArray(rule.stylers)));
  assert.ok(darkMapStyle.some(rule => rule.featureType === "water"));
  assert.ok(darkMapStyle.some(rule => rule.featureType === "road"));
  assert.ok(darkMapStyle.some(rule => rule.featureType === "transit.station"));
});

test("Donkere GTFS-routelijn krijgt licht contrast, felle GTFS-kleuren blijven intact", () => {
  assert.equal(ritRouteKleur("#1E3A8A"), "#1E3A8A");
  assert.match(ritRouteKleurDonker("#1E3A8A"), /^#[A-F0-9]{6}$/);
  assert.notEqual(ritRouteKleurDonker("#1E3A8A"), "#1E3A8A");
  assert.notEqual(ritRouteKleurDonker("#000000"), "#000000");
  assert.equal(ritRouteKleurDonker("#FDE047"), "#FDE047");
  assert.match(kaart, /const lijnKleur = isDark \? ritRouteKleurDonker\(routeColor\) : ritRouteKleur\(routeColor\)/);
  assert.match(kaart, /strokeColor=\{lijnKleur\}/);
  assert.match(kaart, /strokeWidth=\{4\}/);
});

test("Haltestippen, badge en richting behouden scherp contrast met donkere ondergrond", () => {
  assert.match(kaart, /isDark \? \(stop.gepasseerd \? s.halteGepasseerdDonker : s.halteKomendDonker\) : null/);
  // Statistische Android-haltedots met tracksViewChanges=false krijgen een nieuwe snapshot per thema.
  assert.match(kaart, /\$\{stop.gepasseerd \? "voorbij" : "komend"\}:\$\{scheme\}/);
  assert.match(kaart, /halteKomendDonker: \{ backgroundColor: "#FFFFFF", borderColor: "#38BDF8" \}/);
  assert.match(kaart, /halteGepasseerdDonker: \{ backgroundColor: "#94A3B8", borderColor: "#E2E8F0" \}/);
  assert.match(kaart, /const voertuigKleur = colors\.vehicle/);
  assert.match(kaart, /borderBottomColor: voertuigKleur/);
  assert.match(kaart, /backgroundColor: voertuigKleur/);
  assert.match(kaart, /borderColor: "#FFFFFF"/);
  assert.match(kaart, /color: "#FFFFFF"/);
});

test("Vizier is donkerblauw met wit pictogram in donkere modus; licht blijft hetzelfde", () => {
  assert.match(kaart, /backgroundColor: colors\.mapButton/);
  assert.match(kaart, /borderColor: colors\.mapButtonBorder/);
  assert.match(kaart, /name="locate" size=\{23\} color=\{isDark \? "#FFFFFF" : colors.accent\}/);
});
