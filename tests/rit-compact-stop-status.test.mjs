import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ritBannerTitel } from "../lib/wayfindingV2.ts";

const ritCode = readFileSync(new URL("../app/rit.tsx", import.meta.url), "utf8");

test("Bij halte toont punctualiteit, ook als vertraging nul minuten bedraagt", () => {
  const rit = { rit_status:"ARRIVED", live:true, vervallen:false,
    positie_betrouwbaar:true, nu_hier:{ volgende_index:1 }};
  assert.equal(ritBannerTitel(rit), "Bij halte");
  assert.match(ritCode, /Number\.isFinite\(rit\.vertraging_min\)/);
  assert.match(ritCode, /rit\.vertraging_min === 0 \? "· Op tijd"/);
  assert.match(ritCode, /\+\$\{rit\.vertraging_min\} min/);
  assert.match(ritCode, /<Text style=\{\[s\.liveText/);
});

test("Actieve halte heeft normale donkere themakleur zonder groen naamaccent", () => {
  assert.match(ritCode, /\{ color: geweest \|\| h\.vervalt \? colors\.muted : colors\.text/);
  assert.match(ritCode, /\(huidig \|\| naderend \|\| beginhalte \|\| kv8Volgende\) \? \{ fontWeight: "800" \} : null/);
  assert.doesNotMatch(ritCode, /fontWeight: "800", color: bevestigd && huidig \? colors\.live/);
  assert.match(ritCode, /eersteVolgende \? \{ backgroundColor: colors\.infoBg, borderRadius: 12 \} : null/);
  assert.match(ritCode, /huidig && bevestigd \? \(\s*<View style=\{\[s\.nuBol/);
});

test("Haltenaam één regel met tail-ellips en flexkrimp zonder doorzichtige breekpunten", () => {
  assert.match(ritCode, /numberOfLines=\{1\}\s+ellipsizeMode="tail"/);
  assert.match(ritCode, /naamTitel: \{ flex: 1, flexShrink: 1, minWidth: 0/);
  assert.match(ritCode, /\{h\.naam\}/);
  assert.doesNotMatch(ritCode, /stationsnaamMetBreekpunten\(h\.naam\)/);
});
