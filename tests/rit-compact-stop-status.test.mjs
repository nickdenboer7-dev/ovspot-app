import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
const bar = readFileSync(new URL("../components/StatusStrook.tsx", import.meta.url), "utf8");
test("Actuele ritstatus gebruikt dezelfde afgeronde afwijking als volgende halte",()=>{
  assert.match(screen,/const statusAfwijkingMin = rit\?\.live && volgendeRij/);
  assert.match(screen,/volgendeRij\.vertragingMin/);
  assert.match(screen,/afwijkingMin=\{statusAfwijkingMin \?\? 0\}/);
  assert.match(bar,/<RitStatusLabel live=\{live\}/);
});
test("Voorbij is grijs en volgende stop heeft volle achtergrond alleen bij echte GPS",()=>{
  assert.match(stop,/gepasseerd \? colors.sub : colors.text/);
  assert.match(stop,/backgroundColor: volgende \? colors.infoBg/);
  assert.match(stop,/borderColor: gepasseerd \? RITV2.pastDot : RITV2.blue/);
  assert.match(screen,/volgende=\{rijdend && r.index === volgendeIndex\}/);
});
test("Volgende halte heeft compacte countdown, nooit een dubbel Nu-hier-blok",()=>{
  assert.match(stop,/volgendeHalteTekst\(verwachtMs, nu, t\)/);
  assert.match(stop,/t\("Volgende halte"\)/);
  assert.doesNotMatch(screen,/rijen\.push\(\{ soort: "nu"/);
});
