import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stationsnaamMetBreekpunten } from "../lib/stationsnaam.ts";

test("Android mag Lansingerland-Zoetermeer na het koppelteken afbreken", () => {
  const naam = "Lansingerland-Zoetermeer";
  assert.equal(stationsnaamMetBreekpunten(naam), "Lansingerland-\u200BZoetermeer");
  assert.equal(naam, "Lansingerland-Zoetermeer", "de brondata blijven intact");
});

test("Alle koppeltekens worden veilige afbreekpunten; geen middenwoord-breekpunt", () => {
  assert.equal(stationsnaamMetBreekpunten("Amsterdam-Noord-West"), "Amsterdam-\u200BNoord-\u200BWest");
  assert.equal(stationsnaamMetBreekpunten("Den Haag Centraal"), "Den Haag Centraal");
  assert.equal(stationsnaamMetBreekpunten("Zoetermeer"), "Zoetermeer");
});

test("Opnieuw formatteren voegt nooit dubbele zero-width spaces toe", () => {
  const eenKeer = stationsnaamMetBreekpunten("Lansingerland-Zoetermeer");
  assert.equal(stationsnaamMetBreekpunten(eenKeer), eenKeer);
});

test("Nieuwe compacte ritlijst toont haltenaam op één regel zonder woordmanipulatie", () => {
  const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
  assert.match(stop,/numberOfLines=\{1\}>\{naam\}/);
  assert.doesNotMatch(stop,/stationsnaamMetBreekpunten|\.slice\(/);
  assert.match(stop,/labelColumn: \{ flex: 1, minWidth: 0/);
});
