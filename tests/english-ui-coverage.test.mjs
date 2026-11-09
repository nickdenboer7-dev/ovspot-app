import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const source = relative => readFileSync(new URL(relative, import.meta.url), "utf8");
const i18n = source("../lib/i18n.ts");
function loadTs(content, locale = "en_US") {
  const js = ts.transpileModule(content, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020
  }}).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, Intl, Date,
    require: name => {
      if (name === "react-native") return {
        I18nManager: { getConstants: () => ({ localeIdentifier: locale }) }
      };
      throw new Error("Unexpected dependency " + name);
    }
  });
  return exports;
}
const t = loadTs(i18n).vertaling;

test("English system locale and settings keep English language selection", () => {
  const language = loadTs(i18n);
  assert.equal(language.leesSysteemTaal(), "en");
  assert.equal(language.bepaalTaal("en", "nl"), "en");
  assert.equal(language.bepaalTaal("nl", "en"), "nl");
  assert.equal(language.bepaalTaal("auto", "en"), "en");
});

test("Every screen's common English labels, search and fallback are translated", () => {
  const labels = [
    ["Dichtbij", "Nearby"], ["Favorieten", "Favorites"],
    ["Storingen", "Disruptions"], ["Instellingen", "Settings"],
    ["Zoek halte", "Search for a stop"], ["Geen vertrekken", "No departures"],
    ["Meer", "More"], ["Thuislocatie", "Home location"],
    ["Zoek halte, lijn of plaats", "Search for a stop, line or city"],
    ["Kies taal", "Choose language"], ["Licht", "Light"],
    ["GPS actueel", "GPS up to date"], ["GPS verouderd", "GPS outdated"],
    ["GPS niet beschikbaar. Haltes bij Amsterdam Centraal worden getoond; probeer je locatie opnieuw.",
      "GPS unavailable. Showing stops near Amsterdam Centraal; try finding your location again."],
    ["Nieuwe GPS-positie niet beschikbaar. Je ziet je laatst bekende locatie.",
      "New GPS position unavailable. Showing your last known location."],
    ["Geen treinvertrekken in de komende tijd.", "No upcoming train departures."],
    ["Geen busvertrekken in de komende tijd.", "No upcoming bus departures."],
    ["Lijn 97 · 15 sec geleden", "Line 97 · 15 sec ago"],
    ["1 min te vroeg", "1 min early"],
    ["Volgende halte", "Next stop"],
    ["aankomend", "arriving"],
    ["Toon", "Show"], ["volgende haltes", "later stops"],
    ["Geen vertrekken in de komende tijd", "No upcoming departures"]
  ];
  for (const [nl, en] of labels) {
    assert.equal(t(nl, "en"), en, nl);
    assert.equal(t(nl, "nl"), nl, "Do not change Dutch: " + nl);
  }
});

test("Secure API and GPS error messages never remain Dutch", () => {
  const errors = [
    ["Geen beveiligde verbinding", "Unable to establish a secure connection"],
    ["Beveiligde toestelregistratie niet bereikbaar", "Secure device registration unavailable"],
    ["Ongeldig beveiligd API-antwoord", "Invalid secure API response"],
    ["Versleutelde gegevens konden niet worden gecontroleerd", "Unable to verify encrypted data"],
    ["Gegevens tijdelijk niet beschikbaar", "Data temporarily unavailable"],
    ["Geen verbinding. Probeer opnieuw.", "No connection. Please try again."],
    ["Locatiebepaling duurt te lang", "Finding your location is taking too long"],
    ["Ongeldige GPS-positie", "Invalid GPS position"]
  ];
  for (const [nl, en] of errors) assert.equal(t(nl, "en"), en);
  const errorBar = source("../components/ui.tsx");
  assert.match(errorBar, /t\(tekst\)/);
  assert.match(errorBar, /t\("· probeert opnieuw"\)/);
  assert.equal(t("· probeert opnieuw", "en"), "· retrying");
});

test("Departure and favorite accessibility labels have independent translation", () => {
  const departures = source("../components/VertrekRegel.tsx");
  const favorites = source("../app/(tabs)/favorieten.tsx");
  const settings = source("../app/(tabs)/instellingen.tsx");
  const search = source("../app/zoek.tsx");
  assert.match(departures, /t\("minuten vertraging"\)/);
  assert.match(departures, /t\("oorspronkelijk"\)/);
  assert.match(departures, /t\(spoorLabel\(v\.modus, v\.spoor\)\)/);
  assert.match(favorites, /accessibilityLabel=\{t\(/);
  assert.match(settings, /t\(titel\)/);
  assert.match(settings, /t\(waarde \|\| uitleg\)/);
  assert.match(search, /t\(.*\blijnen\b/);
  assert.equal(t("Lijn 97", "en"), "Lijn 97"); // operator route names are not rewritten
  assert.equal(t("Leeuwarden", "en"), "Leeuwarden");
});

test("Journey GPS, early status, and disruption dates respect English", () => {
  const journey = source("../components/RitverloopV2Screen.tsx");
  const map = source("../components/LiveRitKaart.tsx");
  const notice = source("../components/StoringKaart.tsx");
  const dateFormat = loadTs(source("../lib/format.ts"));
  assert.match(journey, /t\(segment \? "GPS actueel" : "GPS verouderd"\)/);
  assert.match(journey, /t\(afwijkingTekst\(statusAfwijkingMin\)\)/);
  assert.match(map, /min te vroeg/);
  assert.match(notice, /periode\(st\.vanaf_ms, st\.tot_ms, Date\.now\(\), taal\)/);
  const march = new Date(2026, 2, 12).getTime();
  assert.equal(dateFormat.datumKort(march, "nl"), "12 mrt");
  assert.equal(dateFormat.datumKort(march, "en"), "12 Mar");
});
