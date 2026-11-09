import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dichtbij = readFileSync(new URL("../app/(tabs)/index.tsx", import.meta.url), "utf8");
const instellingen = readFileSync(new URL("../app/(tabs)/instellingen.tsx", import.meta.url), "utf8");

test("Enlarged nearby title and location badge can occupy separate rows", () => {
  assert.match(dichtbij, /instellingen\.groteTekst && s\.titelRijGroteTekst/);
  assert.match(dichtbij, /instellingen\.groteTekst && s\.titelGroteTekst/);
  assert.match(dichtbij, /instellingen\.groteTekst && s\.locatieChipGroteTekst/);
  assert.match(dichtbij, /titelRijGroteTekst: \{ flexWrap: "wrap"/);
  assert.match(dichtbij, /titelGroteTekst: \{ width: "100%" \}/);
  assert.match(dichtbij, /locatieChipGroteTekst: \{ marginLeft: "auto", maxWidth: "100%" \}/);
});

test("Large-text settings show full selected value below description instead of ellipsis", () => {
  assert.match(instellingen, /const waardeOnder = instellingen\.groteTekst && !!waarde && !!onPress/);
  assert.match(instellingen, /\{waardeOnder \? \(/);
  assert.match(instellingen, /<Text style=\{\[s\.waarde, \{ color: colors\.sub \}\]\}>\{waarde\}<\/Text>/);
  assert.match(instellingen, /\) : !waardeOnder \? \(/);
  assert.match(instellingen, /waardeOnder: \{ flexDirection: "row"/);
  assert.match(instellingen, /label: "Automatisch"/);
});
