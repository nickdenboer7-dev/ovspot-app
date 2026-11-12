import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const get = file => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const base = get("components/ui.tsx");
const common = get("components/OVspotSchermKop.tsx");
const status = get("components/StatusStrook.tsx");
const bar = get("components/OnderBalk.tsx");
const board = get("app/halte/[id].tsx");
const journey = get("components/RitverloopV2Screen.tsx");
const stops = get("components/RitverloopStop.tsx");

test("All five screens reuse the same themed Kop and back navigation", () => {
  for (const path of ["app/(tabs)/index.tsx", "app/(tabs)/favorieten.tsx",
                      "app/(tabs)/instellingen.tsx"]) {
    assert.match(get(path), /<Kop/);
  }
  assert.match(common, /<Kop groot terug titel=\{titel\}/);
  assert.match(board, /<HalteKop naam=\{titel\}/);
  assert.match(journey, /<RitKop/);
  assert.match(base, /colors.header, borderBottomColor: colors.border/);
  assert.doesNotMatch(common, /#0A3A7A|#FFFFFF|backgroundColor: "#0/);
});

test("Shared identity and status use card geometry from other screens", () => {
  assert.match(common, /borderWidth: 1, borderRadius: 18, marginHorizontal: 14/);
  assert.match(status, /borderWidth: 1, borderRadius: 16, marginHorizontal: 14/);
  assert.match(status, /backgroundColor: colors.surface, borderColor: colors.border/);
  assert.match(journey, /tijdlijnKaart: \{ borderTopWidth: StyleSheet.hairlineWidth/);
});

test("Footer is the same for all screens, including subpages and dark mode", () => {
  assert.match(bar, /backgroundColor: colors.surface, borderTopColor: colors.border/);
  assert.match(bar, /aan \? colors.accent : colors.tabInactive/);
  assert.doesNotMatch(bar, /#FFFFFF|#0B57D0|#5F6B7A/);
  assert.match(board, /<OnderBalk actief=\{van\} \/>/);
  assert.match(journey, /<OnderBalk actief=\{van\} \/>/);
});

test("Timeline uses the selected app palette, not its old blue palette", () => {
  assert.match(stops, /gepasseerd \? colors.rail : colors.accent/);
  assert.match(stops, /backgroundColor: gepasseerd \? colors.muted : colors.surface/);
  assert.match(stops, /teRijdenKleur=\{colors.accent\}/);
  assert.doesNotMatch(stops, /RITV2\.blue|RITV2\.navy|#FFFFFF/);
  assert.doesNotMatch(journey, /<StatusBar style="light"/);
});

test("Display-only change preserves GPS poll, complete stopboard and precise times", () => {
  assert.match(journey, /api.liveRitVoertuig\(rit.id, rit.datum\)/);
  assert.match(journey, /projecteerGpsOpRit\(rit, gps\)/);
  assert.match(board, /api.lijnVertrekken\(id, geselecteerdeLijn, actieveModus, isStation\)/);
  assert.match(board, /<VertrekRegel key=/);
  assert.match(journey, /<RitverloopStop key=/);
});
