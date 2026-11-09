import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
const motion = readFileSync(new URL("../components/RijdendVoertuig.tsx", import.meta.url), "utf8");

test("Haltenamen zonder plaats-prefix tonen een vaste 15px regel", () => {
  assert.match(stop, /numberOfLines=\{1\}>\{naam\}/);
  assert.match(stop, /name: \{ fontSize: 15/);
  assert.match(stop, /labelColumn: \{ flex: 1, minWidth: 0/);
});

test("Station krijgt geen apart perronblok dat naamruimte wegneemt", () => {
  assert.doesNotMatch(stop, /spoor && trein|textAlign: "right"/);
  assert.match(stop, /paddingLeft: 5/);
});

test("Geen extra Beginhalte/Eindhalte badges in de compacte ritlijst", () => {
  assert.doesNotMatch(stop, /Eindhalte|Beginhalte|<Label/);
  assert.match(stop, /backgroundColor: volgende \? RITV2\.info/);
});

test("De ritlijst toont uitsluitend halte, zonder tweede plaatsregel", () => {
  assert.match(stop, /numberOfLines=\{1\}>\{naam\}/);
  assert.doesNotMatch(stop, /const showCity|<Text style=\{s\.city\}|city: \{/);
});
