import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("../components/LiveRitKaart.tsx", import.meta.url), "utf8");

test("Optie 2: compacte marker van exact 36px, wit lijnnummer centraal zonder pijl in cirkel", () => {
  assert.match(code, /voertuigMarker: \{[\s\S]*?width: 36, height: 36, borderRadius: 18/);
  assert.match(code, /markerLijn: \{ fontSize: 13, fontWeight: "bold", textAlign: "center"/);
  assert.match(code, /color: "#FFFFFF"/);
  assert.doesNotMatch(code, /name="navigate"\s+color=/);
  assert.match(code, /<View style=\{s.voertuigMarker\}>|<View style=\{\[s.voertuigMarker,/);
});

test("Buitenrand-snaveltje draait met native bearing en de marker blijft vlak op de kaart", () => {
  assert.match(code, /richtingSnavel: \{[\s\S]*?borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 9/);
  assert.match(code, /<View style=\{\[s.richtingSnavel, \{ borderBottomColor: colors.accent \}\]\} \/>/);
  assert.match(code, /flat=\{true\}/);
  assert.match(code, /rotation=\{positie.richting \?\? 0\}/);
  assert.match(code, /anchor=\{\{ x: 0.5, y: 0.5 \}\}/);
});

test("Floating card heeft geen NDOV-merk of dubbele scheiding en toont tijd sinds laatste positie", () => {
  assert.match(code, /Lijn \$\{lijnnummer \|\| positie.lijnnummer\} · \$\{positie.leeftijd_s\} sec geleden/);
  const card = code.slice(code.indexOf('<View style={[s.statusKaart'));
  assert.doesNotMatch(card, /NDOV|·\s*·/);
});
