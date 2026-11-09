import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");
const motion = readFileSync(new URL("../components/RijdendVoertuig.tsx", import.meta.url), "utf8");

test("Statusstrook is ook zichtbaar bij geplande rit en toont geen lege balk", () => {
  assert.match(screen, /status: \{ minHeight: 56/);
  assert.match(screen, /rit\?\.live \? t\("Live"\) : t\("Gepland"\)/);
  assert.match(screen, /<View style=\{s\.status\}>/);
});

test("Vervallen en live hebben afzonderlijke veilige status", () => {
  assert.match(screen, /rit\?\.vervallen \? t\("Vervalt"\)/);
  assert.match(screen, /segment \? t\("Onderweg"\)/);
  assert.match(screen, /rit\?\.live \? t\("Live tijden"\)/);
});

test("Haltelijst sluit na de statusstrook direct aan en laadt zonder pull-to-refresh", () => {
  assert.match(screen, /<ScrollView ref=\{lijstRef\}/);
  assert.doesNotMatch(screen, /RefreshControl/);
  assert.match(screen, /<RitverloopStop/);
});
