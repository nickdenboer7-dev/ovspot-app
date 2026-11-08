import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { storingPastBijModus } from "../lib/storingPerModus.ts";

const storing = (titel, lijnen=[], extra={}) => ({
  id: "s1", soort: "omleiding", label: "Omleiding", titel, tekst: "",
  lijnen, ernst: "low", vanaf_ms: null, tot_ms: null, halte_ids: ["3979722"],
  ...extra
});

test("Live voorbeeld Bus N89 / N91 / N93 uitsluitend op Bus, niet op Metro of Tram", () => {
  const melding = storing("Bus N89, N91 en N93 rijden om vanaf halte Centraal Station.", ["N89","N91","N93"]);
  assert.equal(storingPastBijModus(melding, "bus"), true);
  assert.equal(storingPastBijModus(melding, "metro"), false);
  assert.equal(storingPastBijModus(melding, "tram"), false);
  assert.equal(storingPastBijModus(melding, "train"), false);
  assert.equal(storingPastBijModus(melding, "alles"), true);
});

test("GTFS-storing met expliciete modi gaat boven titel en blijft per modaliteit", () => {
  const st = storing("Werkzaamheden stationsplein", ["52"], { modi: ["metro"] });
  assert.equal(storingPastBijModus(st, "metro"), true);
  assert.equal(storingPastBijModus(st, "bus"), false);
  const dubbel = storing("Algemene werkzaamheden", [], { modi: ["bus","tram"] });
  assert.equal(storingPastBijModus(dubbel, "tram"), true);
  assert.equal(storingPastBijModus(dubbel, "metro"), false);
  assert.equal(storingPastBijModus(storing("Algemeen",[],{modus:"train"}), "train"), true);
});

test("Metrolijn 51 en tramlijn 2 worden uit echte lijncatalogus herkend", () => {
  const catalogus = [{ lijn:"51", modus:"metro" }, { lijn:"2", modus:"tram" }, { lijn:"18", modus:"bus" }];
  assert.equal(storingPastBijModus(storing("Omleiding", ["51"]), "metro", catalogus), true);
  assert.equal(storingPastBijModus(storing("Omleiding", ["51"]), "bus", catalogus), false);
  assert.equal(storingPastBijModus(storing("Omleiding", ["2"]), "tram", catalogus), true);
  assert.equal(storingPastBijModus(storing("Omleiding", ["2"]), "metro", catalogus), false);
});

test("Nachtdienst niet in actuele vertrekken: N82/N89 herkend als bus", () => {
  const nacht = storing("Omleiding nachtlijnen", ["N82","N89"]);
  assert.equal(storingPastBijModus(nacht,"metro"), false);
  assert.equal(storingPastBijModus(nacht,"tram"), false);
  assert.equal(storingPastBijModus(nacht,"bus"), true);
});

test("Algemene storing zonder herkenbare modaliteit wordt nergens verborgen", () => {
  const st = storing("Lift defect bij toegang station");
  for (const modus of ["train","metro","tram","bus","ferry","alles"]) {
    assert.equal(storingPastBijModus(st, modus), true);
  }
});

test("Haltebord past filter toe vóór telling, banner en opengeklapte kaarten", () => {
  const code=readFileSync(new URL("../app/halte/[id].tsx",import.meta.url),"utf8");
  assert.match(code,/const storingen = \(h\?\.storingen \?\? \[\]\)\.filter\(st =>/);
  assert.match(code,/storingPastBijModus\(st, actieveModus, lijnCatalogus, h\?\.vertrekken \?\? \[\]\)/);
  assert.match(code,/\{storingen\[0\]\.titel\}/);
  assert.match(code,/storingen\.length > 1/);
  assert.match(code,/storingen\.map\(\(st\) => <StoringKaart/);
});
