import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("../app/rit.tsx", import.meta.url), "utf8");

test("Lansingerland-Zoetermeer schaalt op één regel zonder halverwege een woord af te breken", () => {
  assert.match(code, /<Text\s+style=\{\[\s*s\.naam,[\s\S]*?numberOfLines=\{1\}\s+adjustsFontSizeToFit=\{true\}\s+minimumFontScale=\{0\.8\}/);
  assert.match(code, /\{h\.naam\}\s*<\/Text>/);
  assert.match(code, /naam: \{[^}]*flex: 1, minWidth: 0, flexShrink: 1/);
});

test("Eindhalte en spoorlabels staan onder de titel en drukken Den Haag Centraal niet weg", () => {
  const nameRow = code.match(/<View style=\{s\.naamRij\}>[\s\S]*?<\/View>/);
  assert.ok(nameRow, "naamRij bestaat");
  assert.doesNotMatch(nameRow[0], /<Label|Spoor|Eindhalte|Beginhalte/);
  const badgePos = code.indexOf('<Label tekst="Eindhalte"');
  assert.ok(badgePos > nameRow.index, "Eindhalte staat na naamRij");
  assert.match(code, /<View style=\{s\.kenmerken\}>[\s\S]*?<Label tekst="Eindhalte"/);
  assert.match(code, /kenmerken: \{[^}]*flexWrap: "wrap"/);
});

test("Spoor wordt ook in de subregel getoond en niet rechts naast de naam", () => {
  assert.match(code, /\{h\.spoor && trein \? <Text style=\{\[s\.spoor, \{ color: colors\.sub \}\]\}>Spoor \{h\.spoor\}<\/Text> : null\}/);
  assert.doesNotMatch(code, /<\/View>\s*\{h\.spoor && trein \? <Text/);
});

test("Volledige aankomst- en vertrektijden blijven onbeperkt zichtbaar", () => {
  assert.match(code, /aankomst \$\{h\.aankomst\} · vertrek \$\{h\.vertrek\}/);
  assert.match(code, /<Text style=\{\[s\.wacht, \{ color: colors\.sub \}\]\} numberOfLines=\{0\}>/);
  assert.ok(code.indexOf('<View style={s.kenmerken}>') > code.indexOf('{aanVertrek ? ('));
});
