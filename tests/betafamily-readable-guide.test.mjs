import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { normaliseerInstellingen, STANDAARD_INSTELLINGEN } from "../lib/instellingenDefaults.ts";
import { GROTE_TEKST_FACTOR, vergrootLetterwaarden } from "../lib/toegankelijkheid.ts";
import { light, dark, highContrastLight, highContrastDark } from "../constants/theme.ts";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const guide = read("../components/KorteUitleg.tsx");
const settings = read("../app/(tabs)/instellingen.tsx");
const localized = read("../components/LocalizedText.tsx");
const context = read("../context/AppProvider.tsx");
const i18n = read("../lib/i18n.ts");

function loadI18n() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(i18n, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, {
    exports, Intl,
    require: name => {
      assert.equal(name, "react-native");
      return { I18nManager: { getConstants: () => ({ localeIdentifier: "en_US" }) } };
    }
  });
  return exports.vertaling;
}
const t = loadI18n();

test("The six-indicator first-use guide remains dismissible and explicitly explains Departed and Scheduled", () => {
  for (const term of ["Nu", "Live", "Vertrokken / Gepland", "+3 min", "GPS-status", "Favorieten"]) {
    assert.ok(guide.includes('title: "' + term + '"'), term);
  }
  assert.match(guide, /Vertrokken is bevestigd\. Gepland is een dienstregelingstijd zonder bevestigde passage\./);
  assert.match(guide, /onPress=\{onSluit\}/);
  assert.match(guide, /accessibilityLabel=\{t\("Uitleg sluiten"\)\}/);
  assert.doesNotMatch(guide, /<Modal\b/);
  assert.equal(t("Vertrokken / Gepland", "en"), "Departed / Scheduled");
  assert.equal(t("Vertrokken is bevestigd. Gepland is een dienstregelingstijd zonder bevestigde passage.", "en"),
    "Departed is confirmed. Scheduled is a timetable time without a confirmed departure.");
});

test("New readability preferences are opt-in, persisted and reject malformed storage", () => {
  const defaults = normaliseerInstellingen({});
  assert.equal(defaults.groteTekst, false);
  assert.equal(defaults.hoogContrast, false);
  assert.equal(STANDAARD_INSTELLINGEN.groteTekst, false);
  assert.equal(STANDAARD_INSTELLINGEN.hoogContrast, false);
  assert.equal(normaliseerInstellingen({ groteTekst: true, hoogContrast: true }).groteTekst, true);
  assert.equal(normaliseerInstellingen({ groteTekst: true, hoogContrast: true }).hoogContrast, true);
  assert.equal(normaliseerInstellingen({ groteTekst: "true", hoogContrast: 1 }).groteTekst, false);
  assert.equal(normaliseerInstellingen({ groteTekst: "true", hoogContrast: 1 }).hoogContrast, false);
  assert.equal(normaliseerInstellingen({ thuis: null, straal: 3000, groteTekst: true }).straal, 3000);
  for (const x of ["Grotere tekst", "Hoog contrast"]) assert.match(settings, new RegExp('titel="' + x + '"'));
  assert.match(settings, /zetInstellingen\(\{ groteTekst \}\)/);
  assert.match(settings, /zetInstellingen\(\{ hoogContrast \}\)/);
  assert.match(context, /instellingen\.hoogContrast/);
  assert.match(context, /highContrastDark : highContrastLight/);
});

test("Larger text affects all centrally localized Text elements but not disabled mode", () => {
  assert.equal(GROTE_TEKST_FACTOR, 1.18);
  assert.equal(vergrootLetterwaarden(14, 19, false), null);
  assert.deepEqual(vergrootLetterwaarden(14, 19, true), { fontSize: 16.5, lineHeight: 22.4 });
  assert.deepEqual(vergrootLetterwaarden(20, undefined, true), { fontSize: 23.6 });
  assert.equal(vergrootLetterwaarden(undefined, undefined, true), null);
  assert.match(localized, /StyleSheet\.flatten\(style\)/);
  assert.match(localized, /instellingen\.groteTekst/);
  assert.match(localized, /style=\{vergroot \? \[style, vergroot\] : style\}/);
});

const luminance = hex => {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(v => parseInt(v, 16) / 255);
  const linear = rgb.map(x => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
};
const contrast = (a, b) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};

test("High-contrast palette has WCAG AA contrast for principal text, buttons and alerts", () => {
  for (const [name, palette] of [["light", highContrastLight], ["dark", highContrastDark]]) {
    for (const [foreground, background] of [
      ["text", "surface"], ["body", "surface"], ["sub", "surface"],
      ["muted", "surface"], ["text", "background"], ["headerText", "header"],
      ["onAccent", "accent"], ["infoText", "infoBg"], ["warnText", "warnBg"]
    ]) {
      assert.ok(contrast(palette[foreground], palette[background]) >= 4.5,
        name + ": " + foreground + "/" + background + " only " +
        contrast(palette[foreground], palette[background]).toFixed(2));
    }
  }
  assert.equal(light.background, "#F8FAFC");
  assert.equal(dark.background, "#0B1220");
});

test("All accessibility labels and guide additions have English equivalents", () => {
  const pairs = [
    ["Grotere tekst", "Larger text"],
    ["Maak de teksten in de app beter leesbaar", "Make app text easier to read"],
    ["Hoog contrast", "High contrast"],
    ["Duidelijker onderscheid tussen tekst en achtergrond", "Stronger contrast between text and background"],
    ["Vertrokken / Gepland", "Departed / Scheduled"],
    ["De belangrijkste symbolen bij vertrekken en ritten.", "Key indicators for departures and journeys."]
  ];
  for (const [nl, en] of pairs) {
    assert.equal(t(nl, "en"), en);
    assert.equal(t(nl, "nl"), nl);
  }
});
