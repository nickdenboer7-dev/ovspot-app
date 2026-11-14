import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kiesAnker, leesBewaardeLijst, leesBewaardePositie, magOudeLijstTonen, meters,
  START_LIJST_MAX_MS, START_POSITIE_MAX_MS } from "../lib/dichtbijStart.ts";

const NU = 1_800_000_000_000;
const LWD = { lat: 53.2012, lon: 5.7999 };
const noord = (p, m) => ({ ...p, lat: p.lat + m / 111_195 });

test("afstand in meters klopt ongeveer", () => {
  assert.ok(Math.abs(meters(LWD, noord(LWD, 100)) - 100) < 1);
  assert.ok(Math.abs(meters(LWD, { lat: LWD.lat, lon: LWD.lon + 0.01 }) - 666) < 5);
});

test("anker verschuift pas na 100 meter of bij een andere bron", () => {
  const a = { ...LWD, bron: "gps" };
  assert.equal(kiesAnker(null, a), a);
  assert.equal(kiesAnker(a, { ...noord(LWD, 60), bron: "gps" }), a);
  const ver = { ...noord(LWD, 140), bron: "gps" };
  assert.equal(kiesAnker(a, ver), ver);
  const thuis = { ...LWD, bron: "thuis" };
  assert.equal(kiesAnker(a, thuis), thuis);
  assert.equal(kiesAnker(a, null), null);
});

test("bewaarde positie: alleen geldig en hooguit 30 minuten oud", () => {
  const raw = t => JSON.stringify({ ...LWD, t });
  assert.deepEqual(leesBewaardePositie(raw(NU - 60_000), NU), LWD);
  assert.equal(leesBewaardePositie(raw(NU - START_POSITIE_MAX_MS - 1), NU), null);
  assert.equal(leesBewaardePositie(raw(NU + 3_600_000), NU), null);      // klok verzet
  assert.equal(leesBewaardePositie("{kapot", NU), null);
  assert.equal(leesBewaardePositie(JSON.stringify({ lat: "x", lon: 5, t: NU }), NU), null);
  assert.equal(leesBewaardePositie(JSON.stringify({ lat: 99, lon: 5, t: NU }), NU), null);
  assert.equal(leesBewaardePositie(null, NU), null);
});

test("bewaarde lijst: alleen compleet en hooguit 5 minuten oud", () => {
  const goed = { key: "k", data: { haltes: [] }, ts: NU - 1000, ...LWD, straal: 3000 };
  assert.deepEqual(leesBewaardeLijst(JSON.stringify(goed), NU), goed);
  assert.equal(leesBewaardeLijst(JSON.stringify({ ...goed, ts: NU - START_LIJST_MAX_MS - 1 }), NU), null);
  assert.equal(leesBewaardeLijst(JSON.stringify({ ...goed, data: {} }), NU), null);
  assert.equal(leesBewaardeLijst(JSON.stringify({ ...goed, straal: null }), NU), null);
  assert.equal(leesBewaardeLijst("", NU), null);
});

test("oude lijst alleen als tussenstand bij dezelfde afstand, recent en van vlakbij", () => {
  const oud = { key: "k1", data: {}, ts: NU - 60_000, ...LWD, straal: 3000 };
  assert.equal(magOudeLijstTonen(oud, LWD, 3000, "k1", NU), true);
  assert.equal(magOudeLijstTonen(oud, noord(LWD, 300), 3000, "k2", NU), true);   // kleine verplaatsing
  assert.equal(magOudeLijstTonen(oud, noord(LWD, 900), 3000, "k3", NU), false);  // te ver weg
  assert.equal(magOudeLijstTonen(oud, LWD, 1000, "k1", NU), false);              // andere afstand
  assert.equal(magOudeLijstTonen({ ...oud, ts: NU - START_LIJST_MAX_MS - 1 }, LWD, 3000, "k1", NU), false);
  assert.equal(magOudeLijstTonen(null, LWD, 3000, "k1", NU), false);
  assert.equal(magOudeLijstTonen(oud, null, 3000, "k1", NU), false);
});

test("Dichtbij start met de bewaarde positie en toont een oudere lijst nooit als live", () => {
  const s = readFileSync(new URL("../app/(tabs)/index.tsx", import.meta.url), "utf8");
  assert.match(s, /AsyncStorage\.multiGet\(\[START_POSITIE_SLEUTEL, START_LIJST_SLEUTEL\]\)/);
  assert.match(s, /setTimeout\(\(\) => klaar\(null\), 400\)/);          // opslag mag de GPS nooit ophouden
  assert.match(s, /if \(bewaard && !laatstePositie\.current\)/);        // echte GPS wint altijd
  assert.match(s, /setVoorlopig\(true\)/);
  assert.match(s, /voorlopig && zoekt \? "Locatie bijwerken…"/);
  assert.match(s, /ankerRef\.current = kiesAnker\(ankerRef\.current, pos\)/);
  assert.match(s, /api\.dichtbij\(pos\.lat, pos\.lon, instellingen\.straal\)/); // ophalen met de nieuwste positie
  assert.match(s, /oudNogLive \? oudeLijst/);
  assert.match(s, /live: false/);
  assert.match(s, /positie\.bron === "gps"\) \{\s+AsyncStorage\.setItem\(START_POSITIE_SLEUTEL/);
});
