import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";

const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");
const defaultsSource = readFileSync(new URL("../lib/instellingenDefaults.ts", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../app/(tabs)/instellingen.tsx", import.meta.url), "utf8");
const translatedTextSource = readFileSync(new URL("../components/LocalizedText.tsx", import.meta.url), "utf8");

function loadTs(source, locale = "nl_NL") {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require: (name) => {
      if (name === "react-native") return {
        I18nManager: { getConstants: () => ({ localeIdentifier: locale }) }
      };
      throw new Error("Unexpected dependency: " + name);
    },
    Intl
  });
  return exports;
}

test("Dutch phones start in Dutch; English phones start in English", () => {
  const nl = loadTs(i18nSource, "nl_NL");
  const en = loadTs(i18nSource, "en_GB");
  assert.equal(nl.leesSysteemTaal(), "nl");
  assert.equal(en.leesSysteemTaal(), "en");
  assert.equal(en.bepaalTaal("auto", "en"), "en");
  assert.equal(en.bepaalTaal("auto", "nl"), "nl");
  assert.equal(en.bepaalTaal("nl", "en"), "nl");
  assert.equal(en.bepaalTaal("en", "nl"), "en");
});

test("Existing settings keep their preferences and default to automatic language", () => {
  const lib = loadTs(defaultsSource);
  assert.equal(lib.normaliseerInstellingen({ thema: "donker" }).taalVoorkeur, "auto");
  assert.equal(lib.normaliseerInstellingen({ taalVoorkeur: "en" }).taalVoorkeur, "en");
  assert.equal(lib.normaliseerInstellingen({ taalVoorkeur: "fr" }).taalVoorkeur, "auto");
  assert.equal(lib.normaliseerInstellingen({ taalVoorkeur: "nl" }).taalVoorkeur, "nl");
  assert.equal(lib.normaliseerInstellingen({ thema: "donker", straal: 3000 }).straal, 3000);
});

test("Visible navigation, journey status, labels, feedback and patterns translate", () => {
  const { vertaling: t } = loadTs(i18nSource, "en_US");
  const examples = [
    ["Dichtbij", "Nearby"],
    ["Favorieten", "Favorites"],
    ["Storingen", "Disruptions"],
    ["Instellingen", "Settings"],
    ["Taal", "Language"],
    ["Scherm aanhouden", "Keep screen on"],
    ["Geen haltes binnen 500 m", "No stops within 500 m"],
    ["Haltes binnen 1,5 km", "Stops within 1,5 km"],
    ["Bij halte gemeld (KV8)", "Reported at stop (KV8)"],
    ["Positie geschat", "Estimated position"],
    ["Toon 4 eerdere haltes", "Show 4 earlier stops"],
    ["GPS actueel", "GPS up to date"],
    ["Lijn 97 · 15 sec geleden", "Line 97 · 15 sec ago"],
    ["Bedankt voor je feedback!", "Thank you for your feedback!"],
    ["E-mailadres (optioneel)", "Email address (optional)"]
  ];
  for (const [input, english] of examples) {
    assert.equal(t(input, "en"), english, "English: " + input);
    assert.equal(t(input, "nl"), input, "Dutch unchanged: " + input);
  }
  assert.equal(t("Leeuwarden", "en"), "Leeuwarden");
  assert.equal(t("Stavoren", "en"), "Stavoren");
  assert.equal(t("Qbuzz", "en"), "Qbuzz");
});

test("Language selection is persistent, user-configurable and no new native dependency is used", () => {
  assert.match(settingsSource, /taalVoorkeur/);
  assert.match(settingsSource, /zetKiezer\("taal"\)/);
  assert.match(settingsSource, /zetInstellingen\(\{ taalVoorkeur:/);
  assert.match(translatedTextSource, /useApp\(\)/);
  assert.match(translatedTextSource, /lokaleKinderen\(children, taal\)/);
  assert.match(i18nSource, /I18nManager\.getConstants\(\)\.localeIdentifier/);
  assert.doesNotMatch(i18nSource, /expo-localization/);
});
