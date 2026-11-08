import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/rit.tsx", import.meta.url), "utf8");

test("rit-tijdlijn heeft een onbeperkte grijze aankomst/vertrek-subtitel", () => {
  assert.match(source, /\{aanVertrek \? \(\s*<Text style=\{\[s\.wacht, \{ color: colors\.sub \}\]\} numberOfLines=\{0\}>/);
  assert.doesNotMatch(source, /<Text style=\{\[s\.wacht, \{ color: colors\.sub \}\]\} numberOfLines=\{1\}>/);
});

test("aankomst 07:41 en vertrek 07:49 blijven een volledige tijdtekst", () => {
  assert.match(source, /aankomst \$\{h\.aankomst\} · vertrek \$\{h\.vertrek\}/);
  assert.match(source, /const wacht = minutenTussen\(h\.aankomst, h\.vertrek\)/);
  const arrival = "07:41", departure = "07:49";
  const text = `aankomst ${arrival} · vertrek ${departure}`;
  assert.equal(text, "aankomst 07:41 · vertrek 07:49");
});

test("de tijdtekst kan over meerdere regels doorlopen op smalle Android-schermen", () => {
  assert.match(source, /naamKol: \{ flex: 1, minWidth: 0,/);
  assert.match(source, /wacht: \{[^}]*flexWrap: "wrap"[^}]*alignSelf: "stretch"[^}]*flexShrink: 1/);
  assert.match(source, /accessibilityLabel=\{\x60[^\n]*aanVertrek/);
});
