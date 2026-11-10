import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { zichtbareStatischeLijnen, filterHalteVertrekken } from "../lib/halteLijnFilter.ts";
import { voegStationVertrektijdenToe } from "../lib/stationGroups.ts";

const source = readFileSync(new URL("../app/halte/[id].tsx",import.meta.url),"utf8");
const backend = readFileSync(new URL("../backend/board_v2.py",import.meta.url),"utf8");
const databaseLijnen=[
  {lijn:"RS2",modus:"train",vervoerder:"Arriva"},
  {lijn:"RE1",modus:"train",vervoerder:"Arriva"},
  {lijn:"21",modus:"bus",vervoerder:"Qbuzz",kleur:"#FFAA00"},
  {lijn:"25",modus:"bus",vervoerder:"Qbuzz"},
  {lijn:"350",modus:"bus",vervoerder:"Qbuzz"},
  {lijn:"350",modus:"bus",vervoerder:"Qbuzz"}, // meerdere route-id's, één chip
  {lijn:"1",modus:"tram",vervoerder:"GVB"}
];

test("Statische lijnen hebben ook zonder vertrek binnen 2 uur altijd een chip",()=>{
  const alle=zichtbareStatischeLijnen(databaseLijnen,"alles");
  assert.deepEqual(alle.map(x=>x.lijn),["RS2","RE1","21","25","350","1"]);
  assert.equal(filterHalteVertrekken([],"alles","350").length,0);
  assert.match(source,/combineerStatischeLijnen\(\s*stationPoll\.data\?\.lijncatalogus, h\?\.lijncatalogus, lijnCatalogus/);
  assert.match(source,/zichtbareStatischeLijnen\(statischeLijnen, actieveModus\)/);
  assert.doesNotMatch(source,/uniekeHalteLijnen\(h\?\.vertrekken/);
});

test("Bus-chips zijn uitsluitend buslijnen; Trein bevat RS2 en RE1",()=>{
  assert.deepEqual(zichtbareStatischeLijnen(databaseLijnen,"bus").map(x=>x.lijn),["21","25","350"]);
  assert.deepEqual(zichtbareStatischeLijnen(databaseLijnen,"train").map(x=>x.lijn),["RS2","RE1"]);
  assert.deepEqual(zichtbareStatischeLijnen(databaseLijnen,"tram").map(x=>x.lijn),["1"]);
  assert.equal(zichtbareStatischeLijnen(databaseLijnen,"metro").length,0);
  assert.equal(zichtbareStatischeLijnen([], "alles").length,0);
  assert.equal(zichtbareStatischeLijnen([{lijn:" ",modus:"bus",vervoerder:"X"}], "bus").length,0);
});

test("GTFS catalogus uit echte stationhaltes behoudt de modaliteit ook zonder vertrek",()=>{
  const basis={
    ok:true,id:"stoparea:18223",modi:["train"],vertrekken:[],
    storingen:[],bijgewerkt:"oud",lijncatalogus:[{lijn:"RS2",modus:"train",vervoerder:"Arriva"}]
  };
  const cluster={
    ok:true,halte_id:"stoparea:18223",bijgewerkt:"nieuw",
    types:["train","bus"],vertrekken:[],lijncatalogus:databaseLijnen
  };
  const station=voegStationVertrektijdenToe(basis,cluster);
  assert.deepEqual(station.lijncatalogus.map(x=>x.lijn),["RS2","RE1","21","25","350","1"]);
  assert.ok(station.modi.includes("bus"));
  assert.deepEqual(zichtbareStatischeLijnen(station.lijncatalogus,"bus").map(x=>x.lijn),["21","25","350"]);
  assert.equal(station.vertrekken.length,0);
});

test("Visuele volgorde is modaliteitskeuze, daarna lijnchips, dan vertrektijden",()=>{
  const header=source.search(/<OVspotSchermKop/);
  const modality=source.indexOf("{meerdereModi ? (",header);
  const lines=source.indexOf("{uniekeLijnen.length >= 1 ? (",modality);
  const departures=source.indexOf("{...swipeResponder.panHandlers}",lines);
  assert.ok(header>=0 && modality>header && lines>modality && departures>lines);
  assert.match(source,/const geselecteerdeLijn = selectedLine && uniekeLijnen.some/);
  assert.match(source,/onKies=\{wisselModus\}/);
  assert.match(source,/wisselModus\(tabModi\[volgende\]\)/);
  assert.match(source,/setGekozenModus\(modus\);\s*setSelectedLine\(null\);\s*setLijnZoektekst\(""\)/);
  assert.match(source,/setSelectedLine\(lijn === geselecteerdeLijn && !richtingActief \? null : lijn\)/);
  assert.match(source,/filterHalteVertrekken\(h\?\.vertrekken \?\? \[\], actieveModus, geselecteerdeLijn\)/);
});

test("Backend route-catalogus komt uit GTFS stop_times/trips/routes en is tijdonafhankelijk",()=>{
  assert.match(backend,/def _static_route_lines\(gtfs, stop_ids\)/);
  assert.match(backend,/FROM stop_times st INDEXED BY idx_stop_times_stop/);
  assert.match(backend,/JOIN trips t ON t.trip_id=st.trip_id/);
  assert.match(backend,/JOIN routes r ON r.route_id=t.route_id/);
  assert.match(backend,/STATIC_ROUTE_LINES_CACHE/);
  assert.match(backend,/"lijncatalogus":lijncatalogus/);
  assert.match(backend,/ids=\[q\["id"\] for q in quays\]/);
  assert.match(backend,/CLUSTER_RADIUS_M = 350/);
});
