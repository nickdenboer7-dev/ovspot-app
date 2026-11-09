import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
const motion = readFileSync(new URL("../components/RijdendVoertuig.tsx", import.meta.url), "utf8");

test("Tijden staan compact, met klein plan onder de vertraagde klok", () => {
  assert.match(stop, /\{afwijkend \? <Text style=\{s\.planned\}>\{gepland\}<\/Text>/);
  assert.match(stop, /textDecorationLine: "line-through"/);
  assert.match(stop, /afwijkend && !vroeg \? <Text style=\{s\.delay\}>/);
  assert.match(stop, /s\.earlyText/);
});

test("De compacte lijst heeft geen tweede aankomst/vertrek-paragraaf", () => {
  assert.doesNotMatch(stop, /aankomst .* vertrek|s\.wacht|numberOfLines=\{0\}/);
  assert.match(stop, /height: hoogte/);
});

test("Kleine Android-schermen krijgen de volledige resterende naamkolom", () => {
  assert.match(stop, /labelColumn: \{ flex: 1, minWidth: 0/);
  assert.match(stop, /numberOfLines=\{1\}/);
});
