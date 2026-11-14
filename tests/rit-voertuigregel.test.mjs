import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voertuigRegel, voertuigNummerKort, ritNummerKort } from "../lib/ritverloopV2.ts";

const bus = (info, extra = {}) => ({ modus: "bus", vervallen: false, voertuig_info: info, voertuig: null, ...extra });

test("nummer zonder vervoerderprefix", () => {
  assert.equal(voertuigNummerKort("QBUZZ_1412"), "1412");
  assert.equal(voertuigNummerKort("1412"), "1412");
  assert.equal(voertuigNummerKort(1412), "1412");
  assert.equal(voertuigNummerKort(null), "");
  assert.equal(voertuigNummerKort("  "), "");
});

test("nummer + verse snelheid", () => {
  assert.deepEqual(voertuigRegel(bus({ nummer: "1412", snelheid_kmh: 37.6, leeftijd_s: 4 }), null),
    { nummer: "1412", snelheidKmh: 38 });
  assert.deepEqual(voertuigRegel(bus({ nummer: "1038", snelheid_kmh: 0, leeftijd_s: 2 }), null),
    { nummer: "1038", snelheidKmh: 0 });
});

test("verouderde of ontbrekende snelheid wordt niet getoond, nummer wel", () => {
  assert.deepEqual(voertuigRegel(bus({ nummer: "1412", snelheid_kmh: 37, leeftijd_s: 120 }), null),
    { nummer: "1412", snelheidKmh: null });
  assert.deepEqual(voertuigRegel(bus({ nummer: "1412", snelheid_kmh: 37 }), null),
    { nummer: "1412", snelheidKmh: null });
  assert.deepEqual(voertuigRegel(bus({ nummer: "1412", snelheid_kmh: -3, leeftijd_s: 1 }), null),
    { nummer: "1412", snelheidKmh: null });
  assert.deepEqual(voertuigRegel(bus({ nummer: "1412", snelheid_kmh: NaN, leeftijd_s: 1 }), null),
    { nummer: "1412", snelheidKmh: null });
  assert.deepEqual(voertuigRegel(bus({ nummer: "1412", snelheid_kmh: 900, leeftijd_s: 1 }), null),
    { nummer: "1412", snelheidKmh: null });
});

test("terugval op live-GPS-nummer, anders niets", () => {
  assert.deepEqual(voertuigRegel(bus(null), { voertuignummer: "QBUZZ_1412" }),
    { nummer: "1412", snelheidKmh: null });
  assert.equal(voertuigRegel(bus(null), null), null);
  assert.equal(voertuigRegel(bus({ nummer: "" }), { voertuignummer: "" }), null);
});

test("treinregel alleen met materieelnummer; geen regel voor vervallen of ontbrekende rit", () => {
  assert.deepEqual(voertuigRegel(bus({ nummer: "8666 + 8727", leeftijd_s: 5, snelheid_kmh: 120 }, { modus: "train" }), null),
    { nummer: "8666 + 8727", snelheidKmh: 120 });
  assert.equal(voertuigRegel(bus(null, { modus: "train" }), null), null);
  assert.equal(voertuigRegel(bus({ nummer: "1" }, { vervallen: true }), null), null);
  assert.equal(voertuigRegel(null, null), null);
  assert.equal(voertuigRegel(undefined, null), null);
});

test("ritpagina toont voertuigregel en 'Halteert op' zonder losse hex-codes", () => {
  const scherm = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  const strook = readFileSync(new URL("../components/StatusStrook.tsx", import.meta.url), "utf8");
  assert.match(scherm, /voertuigRegel\(rit, gps\)/);
  assert.match(scherm, /snelheid=\{snelheidTekst\}/);
  assert.match(scherm, /Halteert op/);
  assert.doesNotMatch(strook, /#[0-9a-fA-F]{6}/);
});

test("ritnummer: alleen kort en numeriek", () => {
  assert.equal(ritNummerKort("1118"), "1118");
  assert.equal(ritNummerKort(1065), "1065");
  assert.equal(ritNummerKort(" 42 "), "42");
  assert.equal(ritNummerKort(""), "");
  assert.equal(ritNummerKort(null), "");
  assert.equal(ritNummerKort("12ab"), "");
  assert.equal(ritNummerKort("123456789"), "");
});

test("ritpagina zet ritnummer voor de voertuigregel", () => {
  const scherm = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  assert.match(scherm, /ritNummerKort\(rit\.rit_nummer\)/);
  assert.match(scherm, /Rit \$\{t\("Rit"\)\}|\$\{t\("Rit"\)\} \$\{ritNr\}/);
});

import { vorigeRitDelen } from "../lib/ritverloopV2.ts";
test("vorige rit: geldig, ongeldig en onvolledig", () => {
  assert.deepEqual(vorigeRitDelen({ lijn: "10", bestemming: "Busstation", vertrek: "21:28" }),
    { lijn: "10", bestemming: "Busstation", vertrek: "21:28" });
  assert.equal(vorigeRitDelen(null), null);
  assert.equal(vorigeRitDelen({ lijn: "10", vertrek: "25:99" }), null);
  assert.equal(vorigeRitDelen({ bestemming: "X", vertrek: "10:00" }), null);
  assert.equal(vorigeRitDelen("x"), null);
});

test("trein: voertuigpositie wordt opgehaald en de kaart hangt van een actuele positie af", () => {
  const scherm = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  assert.match(scherm, /kaartBeschikbaar = !!rit && !rit\.vervallen && \(!trein \|\| actueel\)/);
  assert.doesNotMatch(scherm, /!trein && instellingen\.liveVoertuigen/);
});

import { materieelRegel, kaartOndertitel } from "../lib/ritverloopV2.ts";

test("materieelregel: type, bakken, lengte, stelnummer; korter dan gepland; niets bekend = leeg", () => {
  assert.equal(materieelRegel({ type: "VIRM", bakken: 6, lengte_m: 161, stel: ["8740"] }), "VIRM · 6 bakken · 161 m · stel 8740");
  assert.equal(materieelRegel({ type: "SLT", bakken: 4, lengte_m: 69, stel: ["2434"] }), "SLT · 4 bakken · 69 m · stel 2434");
  assert.equal(materieelRegel({ type: "VIRM", bakken: 10, lengte_m: 270, stel: ["8666", "8727"], korter: true }),
    "VIRM · 10 bakken · 270 m · stel 8666 + 8727 · korter dan gepland");
  assert.equal(materieelRegel({ type: "VIRM", bakken: 6, lengte_m: 161, stel: ["8740"] }, "en"), "VIRM · 6 cars · 161 m · set 8740");
  assert.equal(materieelRegel({ type: null, bakken: 1, lengte_m: null, stel: [] }), "1 bak");
  assert.equal(materieelRegel({ stel: ["abc", "12"] }), "stel 12");          // alleen cijfers als stelnummer
  assert.equal(materieelRegel(null), "");
  assert.equal(materieelRegel({ type: null, bakken: null, lengte_m: null, stel: [] }), "");
});

test("kaartondertitel: trein met type en ritnummer, bus met 'Lijn', snelheid alleen als vers", () => {
  assert.equal(kaartOndertitel({ trein: true, lijn: "IC", ritNr: "1414", snelheidKmh: 80, leeftijdS: 25 }), "Intercity 1414 · 80 km/h · 25 sec geleden");
  assert.equal(kaartOndertitel({ trein: true, lijn: "SPR", ritNr: "5068", snelheidKmh: null, leeftijdS: 10 }), "Sprinter 5068 · 10 sec geleden");
  assert.equal(kaartOndertitel({ trein: true, lijn: "IC", leeftijdS: 5 }), "Intercity · 5 sec geleden");
  assert.equal(kaartOndertitel({ trein: false, lijn: "395", snelheidKmh: 38.4, leeftijdS: 12 }), "Lijn 395 · 38 km/h · 12 sec geleden");
  assert.equal(kaartOndertitel({ trein: false, lijn: "395", snelheidKmh: 38, leeftijdS: 60 }), "Lijn 395 · 60 sec geleden");
  assert.equal(kaartOndertitel({ trein: false, lijn: "395", snelheidKmh: 300, leeftijdS: 5 }), "Lijn 395 · 5 sec geleden");
  assert.equal(kaartOndertitel({ trein: true, lijn: "RARE", ritNr: "1", leeftijdS: 1 }), "RARE 1 · 1 sec geleden");
});

test("ritpagina en kaart gebruiken materieelregel en ondertitel", () => {
  const scherm = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  const kaart = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");
  assert.match(scherm, /materieelRegel\(rit\.materieel_info, taal\)/);
  assert.match(scherm, /ondertitel=\{actueel && gps \? kaartOndertitel\(/);
  assert.match(kaart, /ondertitel \|\| `Lijn /);
});
