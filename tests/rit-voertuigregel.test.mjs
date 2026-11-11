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

test("geen voertuigregel voor trein, vervallen rit of ontbrekende rit", () => {
  assert.equal(voertuigRegel(bus({ nummer: "1" }, { modus: "train" }), null), null);
  assert.equal(voertuigRegel(bus({ nummer: "1" }, { vervallen: true }), null), null);
  assert.equal(voertuigRegel(null, null), null);
  assert.equal(voertuigRegel(undefined, null), null);
});

test("ritpagina toont voertuigregel en 'Halteert op' zonder losse hex-codes", () => {
  const scherm = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  const strook = readFileSync(new URL("../components/StatusStrook.tsx", import.meta.url), "utf8");
  assert.match(scherm, /voertuigRegel\(rit, gps\)/);
  assert.match(scherm, /<RitInfoKaart rijen=\{infoRijen\} \/>/);
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
  assert.match(scherm, /ritInfoRijen\(\{/);
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

import { ritInfoRijen } from "../lib/ritverloopV2.ts";
test("ritinfo-rijen: volgorde en lege waarden", () => {
  const r = ritInfoRijen({ ritNr: "1151", voertuig: { nummer: "4316", snelheidKmh: 38 },
    eindNaam: "Zaans Medisch Centrum", eindTijd: "00:33",
    vorige: { lijn: "395", bestemming: "Amsterdam Sloterdijk", vertrek: "23:41" } });
  assert.deepEqual(r.map(x => x.label), ["Rit", "Voertuig", "Snelheid", "Aankomst", "Reed eerder als"]);
  assert.equal(r[3].waarde, "00:33 Zaans Medisch Centrum");
  assert.deepEqual(ritInfoRijen({}), []);
  assert.equal(ritInfoRijen({ voertuig: { nummer: "1", snelheidKmh: null } }).length, 1);
});
