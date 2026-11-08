import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { maakZoekKaarten, isVervangendeBuslijn } from "../lib/wayfindingV2.ts";
import { modusIcoonKleur } from "../constants/wayfinding.ts";

const lijn = (nummer, modus) => ({ lijn: nummer, modus, vervoerder: "TEST" });
const halte = (modi, lijnen) => ({
  id: "3979722", soort: "halte", naam: "Centraal Station", plaats: "Amsterdam",
  modi, lijnen, lijnen_aantal: lijnen.length, lat: 52.38, lon: 4.9
});

test("Amsterdam Centraal: Trein bevat alleen treinen, Metro 51/52 en Bus alleen buslijnen", () => {
  const kaarten = maakZoekKaarten([halte(
    ["train", "metro", "tram", "bus"],
    [lijn("Intercity", "train"), lijn("Sprinter", "train"), lijn("51", "metro"),
      lijn("52", "metro"), lijn("2", "tram"), lijn("18", "bus")]
  )]);
  assert.deepEqual(kaarten.map(k => k.modus), ["train", "metro", "tram", "bus"]);
  for (const kaart of kaarten) {
    assert.ok(kaart.lijnen.every(l => l.modus === kaart.modus), kaart.modus);
    assert.equal(kaart.gesplitst, true);
  }
  assert.deepEqual(kaarten.find(k => k.modus === "metro").lijnen.map(l => l.lijn), ["51", "52"]);
  assert.deepEqual(kaarten.find(k => k.modus === "train").lijnen.map(l => l.lijn), ["Sprinter", "Intercity"]);
  assert.deepEqual(kaarten.find(k => k.modus === "bus").lijnen.map(l => l.lijn), ["18"]);
});

test("Snelbus/Stopbus ipv trein: geen aparte Bus-hoofdkaart op het treinstation", () => {
  const kaarten = maakZoekKaarten([halte(
    ["train", "bus"],
    [lijn("Intercity", "train"), lijn("Stoptrein RS1", "train"),
      lijn("Snelbus ipv trein", "bus"), lijn("Stopbus ipv trein", "bus")]
  )]);
  assert.equal(kaarten.length, 1);
  assert.equal(kaarten[0].modus, "train");
  assert.equal(kaarten[0].gesplitst, false);
  assert.equal(kaarten[0].vervangendBusvervoer, true);
  assert.ok(kaarten[0].lijnen.every(l => l.modus === "train"));
  assert.equal(isVervangendeBuslijn(lijn("Snelbus ipv trein", "bus")), true);
  assert.equal(isVervangendeBuslijn(lijn("Stopbus ipv trein", "bus")), true);
});

test("Echte buslijnen en vervangende bussen horen samen op één Bus-kaart", () => {
  const kaarten = maakZoekKaarten([halte(["train", "bus"],
    [lijn("Intercity", "train"), lijn("18", "bus"), lijn("Snelbus ipv trein", "bus"), lijn("Stopbus ipv trein", "bus")])]);
  assert.deepEqual(kaarten.map(x => x.modus), ["train", "bus"]);
  assert.equal(kaarten.find(x => x.modus === "bus").lijnen.length, 3);
  assert.ok(kaarten.find(x => x.modus === "bus").lijnen.every(x => x.modus === "bus"));
  assert.equal(kaarten.some(x => x.vervangendBusvervoer), false);
});

test("Bus-only en trein-only krijgen het juiste enkele icoon; gemengde legacy zonder lijnen neutraal", () => {
  const singleBus = maakZoekKaarten([halte(["bus"], [lijn("18","bus")])]);
  assert.equal(singleBus[0].modus, "bus");
  assert.equal(singleBus[0].gesplitst, false);
  const singleTrain = maakZoekKaarten([halte(["train"], [lijn("Intercity","train")])]);
  assert.equal(singleTrain[0].modus, "train");
  const unknown = maakZoekKaarten([halte(["train","bus"], [])]);
  assert.equal(unknown[0].modus, null);
});

test("Vaste wayfindingkleur van het modus-icoon staat los van vervoerder of routebadges", () => {
  assert.deepEqual(
    ["train","metro","tram","bus","ferry"].map(m => modusIcoonKleur(m).bg),
    ["#ffc917","#0863b5","#cb3b2c","#16865f","#0b878a"]);
  assert.equal(modusIcoonKleur("train").fg, "#003082");
  assert.equal(modusIcoonKleur(null).bg, "#185c98");
});

test("Zoeken presenteert ieder modus-icoon op uitsluitend de eigen zoekkaart", () => {
  const code = readFileSync(new URL("../app/zoek.tsx", import.meta.url), "utf8");
  assert.match(code, /const palet = modusIcoonKleur\(kaart\.modus\)/);
  assert.match(code, /kaart\.modus === "train" \? "train-outline"/);
  assert.match(code, /kaart\.modus === "metro" \? "subway-outline"/);
  assert.match(code, /kaart\.modus === "bus" \? "bus-outline"/);
  assert.match(code, /kaart\.vervangendBusvervoer/);
  assert.match(code, /Vervangend busvervoer beschikbaar/);
});
