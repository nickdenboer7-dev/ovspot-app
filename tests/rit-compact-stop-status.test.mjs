import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
const motion = readFileSync(new URL("../components/RijdendVoertuig.tsx", import.meta.url), "utf8");

test("Actuele ritstatus gebruikt dezelfde afgeronde afwijking als volgende halte", () => {
  assert.match(screen, /const statusAfwijkingMin = rit\?\.live && volgendeRij/);
  assert.match(screen, /volgendeRij\.vertragingMin/);
  assert.match(screen, /t\(afwijkingTekst\(statusAfwijkingMin\)\)/);
  assert.match(screen, /const status = rit\?\.vervallen/);
  assert.match(screen, /t\(segment \? "GPS actueel" : "GPS verouderd"\)/);
});

test("Voorbij is grijs en volgende stop heeft blauwe achtergrond, donkere naam", () => {
  assert.match(stop, /gepasseerd \? RITV2\.muted : RITV2\.ink/);
  assert.match(stop, /backgroundColor: volgende \? RITV2\.info/);
  assert.match(stop, /borderColor: gepasseerd \? RITV2\.pastDot : RITV2\.blue/);
});

test("Volgende halte heeft een compacte countdown, geen losse Nu hier-rij", () => {
  assert.match(stop, /volgendeHalteTekst\(verwachtMs, nu, t\)/);
  assert.match(stop, /t\("Volgende halte"\)/);
  assert.doesNotMatch(screen, /rijen\.push\(\{ soort: "nu"/);
});
