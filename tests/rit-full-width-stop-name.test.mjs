import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const rit = readFileSync(new URL("../app/rit.tsx", import.meta.url), "utf8");

test("IC Schiphol Airport toont volledige GTFS-namen uit h.naam zonder handmatige afkorting", () => {
  const n = rit.indexOf('<View style={s.naamRij}>');
  const e = rit.indexOf('\n                </View>', n);
  assert.ok(n >= 0 && e > n);
  const nameBlock = rit.slice(n, e);
  assert.match(nameBlock, /\{h\.naam\}/);
  assert.doesNotMatch(nameBlock, /h\.naam\s*\.(?:slice|substring|substr)\s*\(|truncate\s*\(|\.\.\.|…/);
  assert.match(nameBlock, /numberOfLines=\{1\}\s+ellipsizeMode="tail"\s+adjustsFontSizeToFit\s+minimumFontScale=\{0\.82\}/);
});

test("Naamkolom benut alle beschikbare ruimte en spoornummer reserveert alleen eigen tekstbreedte", () => {
  assert.match(rit, /naamKol: \{ flex: 1, minWidth: 0,[^}]*paddingLeft: 6/);
  assert.match(rit, /naamRij: \{ flexDirection: "row", alignItems: "flex-start", minWidth: 0, gap: 4 \}/);
  assert.match(rit, /naamTitel: \{ flex: 1, flexShrink: 1, minWidth: 0 \}/);
  assert.match(rit, /spoor: \{ fontSize: 13, textAlign: "right", flexShrink: 0, paddingTop: 3 \}/);
  assert.doesNotMatch(rit, /(?:naamKol|naamRij|naamTitel|spoor): \{[^}]*\b(?:width|maxWidth|minWidth): (?!0\b)\d+/);
});

test("Spoor blijft naast de haltenaam, maar dwingt geen 52 px minimumruimte af", () => {
  assert.match(rit, /\{h\.spoor && trein \? \(\s*<Text style=\{\[s\.spoor,/);
  assert.doesNotMatch(rit, /minWidth: 52/);
});
