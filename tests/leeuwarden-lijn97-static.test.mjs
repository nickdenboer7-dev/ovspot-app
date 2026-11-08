import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  combineerStatischeLijnen,
  filterHalteVertrekken,
  zoekStatischeLijnen,
  zichtbareStatischeLijnen
} from "../lib/halteLijnFilter.ts";
import { voegStationVertrektijdenToe } from "../lib/stationGroups.ts";

const scherm = readFileSync(new URL("../app/halte/[id].tsx", import.meta.url), "utf8");

const qb = n => ({ lijn: String(n), modus: "bus", vervoerder: "Qbuzz" });
const train = n => ({ lijn: n, modus: "train", vervoerder: "NS" });

test("Leeuwarden: Qbuzz 97 heeft altijd een statische chip, ook als het eerste vertrek pas 09:02 is",()=>{
  const buslijnen = [
    ...Array.from({ length: 26 }, (_, i) => qb(i + 1)),
    qb("97"),
    ...Array.from({ length: 18 }, (_, i) => qb(i + 100))
  ];
  const catalogus = [train("RS2"), train("RE1"), ...buslijnen];
  const bus = zichtbareStatischeLijnen(catalogus, "bus");
  assert.equal(bus.length,45);
  assert.ok(bus.some(l => l.lijn === "97"));
  assert.equal(bus.findIndex(l=>l.lijn==="97"),26);
  assert.deepEqual(zoekStatischeLijnen(bus,"97").map(l=>l.lijn),["97"]);
  assert.deepEqual(zoekStatischeLijnen(bus,"qBuZz").length,45);
  assert.ok(!bus.some(l=>l.modus==="train"));
  assert.equal(filterHalteVertrekken([], "bus", "97").length,0);
  assert.match(scherm,/const getoondeLijnChips = useMemo/);
  assert.match(scherm,/zoekStatischeLijnen\(uniekeLijnen, lijnZoektekst\)/);
  assert.match(scherm,/getoondeLijnChips\.map\(lijn => \{/);
  assert.match(scherm,/placeholder="Zoek lijnnummer, bijvoorbeeld 97"/);
});

test("Vaste catalogi blijven verenigd bij een kleine /halte-respons of 350m-cluster",()=>{
  const aankomstloze = [train("RS2"), qb("97")];
  const station = {
    id:"2993405",modi:["train"],vertrekken:[],bijgewerkt:"nu",
    lijncatalogus:[train("IC"),qb("21")]
  };
  const cluster = {
    ok:true,halte_id:"2993405",vertrekken:[],bijgewerkt:"nu",
    types:["train","bus"],lijncatalogus:aankomstloze
  };
  const gemengd=voegStationVertrektijdenToe(station,cluster);
  assert.deepEqual(gemengd.lijncatalogus.map(x=>x.lijn),["RS2","97","IC","21"]);
  const routes=combineerStatischeLijnen(gemengd.lijncatalogus,[qb("350"),qb("97")]);
  assert.deepEqual(zichtbareStatischeLijnen(routes,"bus").map(x=>x.lijn),["97","21","350"]);
  assert.deepEqual(zichtbareStatischeLijnen(routes,"train").map(x=>x.lijn),["RS2","IC"]);
  assert.deepEqual(zoekStatischeLijnen(routes,"97").map(x=>x.lijn),["97"]);
  assert.equal(filterHalteVertrekken(gemengd.vertrekken,"bus",null).length,0);
});

test("Modaliteit staat boven de chips; reset lijn- en zoekfilter bij iedere tabwissel",()=>{
  const mode=scherm.indexOf("{meerdereModi ? (");
  const chip=scherm.indexOf("{uniekeLijnen.length >= 1 ? (",mode);
  const list=scherm.indexOf("{...swipeResponder.panHandlers}",chip);
  assert.ok(mode>=0 && chip>mode && list>chip);
  assert.match(scherm,/const wisselModus = \(modus: string\) => \{/);
  assert.match(scherm,/setGekozenModus\(modus\);\s*setSelectedLine\(null\);\s*setLijnZoektekst\(""\)/);
  assert.match(scherm,/onKies=\{wisselModus\}/);
  assert.match(scherm,/wisselModus\(tabModi\[volgende\]\)/);
  assert.match(scherm,/getoondeLijnChips\.map\(lijn => \{/);
  assert.ok(scherm.includes("veeg voor meer"));
  assert.match(scherm,/accessibilityLabel=\{zoekveldOpen \? "Lijn zoeken sluiten" : "Lijnnummer zoeken"\}/);
});

test("Bestaande routekleuren worden niet overschreven door oudere zoekkaartdata",()=>{
  const merged=combineerStatischeLijnen(
    [{lijn:"97",modus:"bus",vervoerder:"Qbuzz",kleur:"#FEDB00"}],
    [{lijn:"97",modus:"bus",vervoerder:"Qbuzz"}],
    [{lijn:"97",modus:"bus",vervoerder:"Qbuzz",kleur:"#111111"}]
  );
  assert.equal(merged.length,1);
  assert.equal(merged[0].kleur,"#FEDB00");
});
