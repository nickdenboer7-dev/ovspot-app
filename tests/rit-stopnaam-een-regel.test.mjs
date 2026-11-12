import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Nieuwe compacte ritlijst toont haltenaam op één regel zonder woordmanipulatie", () => {
  const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
  assert.match(stop,/numberOfLines=\{markeer \? undefined : 1\}>\{zichtbaarNaam\}/);
  assert.doesNotMatch(stop,/\.slice\(/);
  assert.match(stop,/labelColumn: \{ flex: 1, minWidth: 0/);
});
