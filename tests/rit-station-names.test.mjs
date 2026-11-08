import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("../app/rit.tsx", import.meta.url), "utf8");

test("Haltenamen blijven op één regel en krijgen een nette ellips, zonder losse laatste letter", () => {
  assert.match(code, /<Text\s+style=\{\[\s*s\.naam,[\s\S]*?numberOfLines=\{1\}\s+ellipsizeMode="tail"/);
  assert.match(code, /\{h\.naam\}\s*<\/Text>/);
  assert.doesNotMatch(code, /stationsnaamMetBreekpunten\(h\.naam\)/);
  assert.match(code, /naam: \{[^}]*flexShrink: 1/);
  assert.match(code, /naamTitel: \{[^}]*flex: 1, flexShrink: 1, minWidth: 0 \}/);
  assert.doesNotMatch(code, /naamTitel: \{[^}]*paddingRight:|naamTitel: \{[^}]*maxWidth:/);
  assert.match(code, /adjustsFontSizeToFit\s+minimumFontScale=\{0\.82\}/);
});

test("Spoor staat rechts in de stationsnaamrij, met eigen ruimte zonder krimp", () => {
  const nameRow = code.match(/<View style=\{s\.naamRij\}>[\s\S]*?<\/View>\s*\{h\.spoor && trein \? \([\s\S]*?\) : null\}\s*<\/View>/);
  assert.ok(nameRow, "naamRij bevat zowel de naamcontainer als het spoornummer");
  assert.match(nameRow[0], /<View style=\{s\.naamTitel\}>/);
  assert.match(nameRow[0], /<Text style=\{\[s\.spoor, \{ color: colors\.sub \}\]\} numberOfLines=\{1\}>\s*Spoor \{h\.spoor\}/);
  assert.match(code, /naamRij: \{[^}]*flexDirection: "row", alignItems: "flex-start", minWidth: 0, gap: 4/);
  assert.match(code, /spoor: \{[^}]*textAlign: "right", flexShrink: 0/);
  assert.doesNotMatch(code, /spoor: \{[^}]*minWidth:|spoor: \{[^}]*width:|spoor: \{[^}]*maxWidth:/);
});

test("Eindhalte- en Beginhalte-badges staan onder de naam, niet naast het spoor", () => {
  const nameRowStart = code.indexOf("<View style={s.naamRij}>");
  const nameRowEnd = code.indexOf("\n                </View>", nameRowStart);
  const nameRow = code.slice(nameRowStart, nameRowEnd);
  assert.doesNotMatch(nameRow, /<Label|Eindhalte|Beginhalte/);
  const badgePos = code.indexOf('<Label tekst="Eindhalte"');
  assert.ok(badgePos > nameRowEnd, "Eindhalte staat onder de stationsnaamrij");
  assert.match(code, /<View style=\{s\.kenmerken\}>[\s\S]*?<Label tekst="Eindhalte"/);
  assert.match(code, /kenmerken: \{[^}]*flexWrap: "wrap"/);
});

test("Volledige aankomst- en vertrektijden blijven onbeperkt zichtbaar", () => {
  assert.match(code, /aankomst \$\{h\.aankomst\} · vertrek \$\{h\.vertrek\}/);
  assert.match(code, /<Text style=\{\[s\.wacht, \{ color: colors\.sub \}\]\} numberOfLines=\{0\}>/);
  assert.ok(code.indexOf('<View style={s.kenmerken}>') > code.indexOf('{aanVertrek ? ('));
});
