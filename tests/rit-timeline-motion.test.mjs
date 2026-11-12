import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const movingBus = readFileSync(new URL("../components/RijdendVoertuig.tsx", import.meta.url), "utf8");

test("New UI keeps the bus on the rail and next-stop status on the row", () => {
  const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
  const modern = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  assert.match(stop,/<RijdendVoertuig/);
  assert.match(stop,/t\("Volgende halte"\)/);
  assert.match(modern,/projecteerGpsOpRit\(rit, gps\)/);
  assert.match(movingBus,/Animated\.timing\(beweging/);
  assert.match(movingBus,/backgroundColor: geredenKleur/);
  assert.match(movingBus,/backgroundColor: teRijdenKleur/);
  assert.match(movingBus,/top: -vorigeHoogte \/ 2/);
  assert.doesNotMatch(movingBus,/Date\.now\(\)|volgendeMs/);
});

test("Status is plat, toont volgend halteverschil en juiste GPS-chip", () => {
  const modern = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
  assert.match(modern,/const paar = segment && haltes\[segment\.vorigeIndex\]/);
  assert.match(modern,/paar \? \x60\$\{t\("Onderweg tussen"\)\} \$\{paar\}\x60/);
  assert.match(modern,/const statusAfwijkingMin = rit\?\.live && volgendeRij/);
  assert.match(modern, /<StatusStrook/);
  assert.match(modern, /<StatusStrook/);
  assert.match(modern, /chip=\{nogNietVertrokken \? "Geen voertuig-GPS" : !trein \? gpsStatus/);
});
