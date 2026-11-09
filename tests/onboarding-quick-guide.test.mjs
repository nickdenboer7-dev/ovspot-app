import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = path => readFileSync(new URL(path, import.meta.url), "utf8");
const provider = source("../context/AppProvider.tsx");
const nearby = source("../app/(tabs)/index.tsx");
const settings = source("../app/(tabs)/instellingen.tsx");
const component = source("../components/KorteUitleg.tsx");
const storageSource = source("../lib/onboardingGuide.ts");
const i18n = source("../lib/i18n.ts");

const transpile = src => ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;

function storageModule(storage) {
  const exports = {};
  vm.runInNewContext(transpile(storageSource), {
    exports,
    require: name => {
      assert.equal(name, "@react-native-async-storage/async-storage");
      return { __esModule: true, default: storage };
    }
  });
  return exports;
}

const translateExports = {};
vm.runInNewContext(transpile(i18n), {
  exports: translateExports,
  Intl,
  require: () => ({ I18nManager: { getConstants: () => ({ localeIdentifier: "en_US" }) } })
});

test("First-use guide is shown only before dismissal and dismissal persists across launches", async () => {
  const data = new Map();
  const storage = {
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => { data.set(key, value); }
  };
  const { korteUitlegGezien, markeerKorteUitlegGezien } = storageModule(storage);
  assert.equal(await korteUitlegGezien(), false);
  await markeerKorteUitlegGezien();
  assert.equal(await korteUitlegGezien(), true);
  assert.equal(data.get("ovspot.korte-uitleg.v1"), "1");
});

test("Storage errors do not block the app on first use", async () => {
  const broken = storageModule({
    getItem: async () => { throw new Error("storage unavailable"); },
    setItem: async () => { throw new Error("storage unavailable"); }
  });
  assert.equal(await broken.korteUitlegGezien(), false);
  await assert.doesNotReject(() => broken.markeerKorteUitlegGezien());
});

test("Guide loads with app settings without creating a new API request", () => {
  assert.match(provider, /Promise\.all\(\[leesInstellingen\(\), leesFavorieten\(\), korteUitlegGezien\(\)\]\)/);
  assert.match(provider, /setUitlegZichtbaar\(!gezien\)/);
  assert.match(provider, /setUitlegZichtbaar\(false\)/);
  assert.match(provider, /void markeerKorteUitlegGezien\(\)/);
  assert.match(nearby, /uitlegZichtbaar \? <KorteUitleg onSluit=\{sluitUitleg\}/);
  assert.doesNotMatch(component, /\bapi\.|\bfetch\(|Location\.request/);
});

test("A dismissible guide includes Now, Live, delays, GPS and favorites, but no forced modal", () => {
  for (const label of ["Nu", "Live", "+3 min", "GPS-status", "Favorieten"]) {
    assert.ok(component.includes('title: "' + label + '"'), label);
  }
  assert.match(component, /accessibilityLabel=\{t\("Uitleg sluiten"\)\}/);
  assert.match(component, /onPress=\{onSluit\}/);
  assert.match(component, /Begrepen/);
  assert.doesNotMatch(component, /<Modal\b/);
});

test("Guide reopens from Settings and translations cover the entire explanation", () => {
  assert.match(settings, /titel="Korte uitleg"/);
  assert.match(settings, /toonUitleg\(\); router\.navigate\("\/"\)/);
  const t = translateExports.vertaling;
  const cases = [
    ["Korte uitleg", "Quick guide"],
    ["OVspot in het kort", "OVspot at a glance"],
    ["Begrepen", "Got it"],
    ["Uitleg sluiten", "Close guide"],
    ["GPS-status", "GPS status"],
    ["Het vertrek is nu of binnen ongeveer 30 seconden.", "The departure is now or within about 30 seconds."],
    ["De tijd is bijgewerkt met actuele OV-gegevens.", "This time is updated with current public transport data."],
    ["De rit is 3 minuten later dan gepland.", "The service is running 3 minutes late."],
    ["Actueel geeft een bevestigde positie aan; verouderd of onzeker niet.", "Current means a confirmed position; outdated or uncertain does not."],
    ["Tik op de ster bij een halte om die snel terug te vinden.", "Tap the star on a stop to find it again quickly."]
  ];
  for (const [nl, en] of cases) {
    assert.equal(t(nl, "en"), en, nl);
    assert.equal(t(nl, "nl"), nl);
  }
});
