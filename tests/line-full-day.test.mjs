import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../app/halte/[id].tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");

test("lijn-chip haalt eigen volledige GTFS-vertrekdag op", () => {
  assert.match(api, /lijnVertrekken: \(id: string, lijn: string, modus: string, cluster: boolean\)/);
  assert.match(api, /\/lijnvertrekken\?halte_id=/);
  assert.match(screen, /api\.lijnVertrekken\(id, geselecteerdeLijn, actieveModus, isStation\)/);
  assert.match(screen, /const vertrekken = geselecteerdeLijn \? \(lijnData\?\.vertrekken \?\? \[\]\) : basisVertrekken/);
});

test("wisselen van lijn mag geen oudere ritten van andere lijn tonen", () => {
  assert.match(screen, /lijnPoll\.data\?\.lijn === geselecteerdeLijn/);
  assert.match(screen, /lijnPoll\.data\?\.modus === actieveModus/);
  assert.match(screen, /lijnPoll\.data\?\.halte_id === id/);
  assert.match(screen, /setSelectedLine\(lijn === geselecteerdeLijn \? null : lijn\)/);
});

test("lege lijn is pas leeg na eigen API antwoord; geen onware 2-uursmelding", () => {
  assert.match(screen, /geselecteerdeLijn && !lijnData && !lijnPoll\.fout/);
  assert.match(screen, /Volledige dienstregeling niet bereikbaar/);
  assert.match(screen, /Geen vertrekken meer vandaag voor lijn/);
  assert.match(screen, /lijnData\?\.volgende_rit/);
  assert.match(screen, /geselecteerdeLijn \? lijnPoll\.verversen\(\) : Promise\.resolve\(\)/);
});
