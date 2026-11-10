import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const shared = readFileSync(new URL("../components/StatusStrook.tsx", import.meta.url), "utf8");
const live = readFileSync(new URL("../components/LiveBalk.tsx", import.meta.url), "utf8");
test("Statusstrook ook bij geplande rit, met geplande vertrekregel en livebalk", () => {
 assert.match(screen,/<StatusStrook/);
 assert.match(screen,/const geplandeStatus = nogNietVertrokken/);
 assert.match(screen,/tekst=\{geplandeStatus\}/);
 assert.match(screen,/<LiveBalk live=\{liveVoorBalk\}/);
 assert.match(live,/isLive \? colors.live : colors.muted/);
});
test("Vervallen en live hebben aparte gedeelde status, nooit een nep-live-indicator", () => {
 assert.match(shared,/<RitStatusLabel live=\{live\} vervallen=\{vervallen\}/);
 assert.match(screen,/vervallen=\{!!rit\?\.vervallen\}/);
 assert.match(screen,/const liveVoorBalk = !!rit && rit.live && !rit.vervallen/);
});
test("Haltelijst volgt statusstrook en laadt zonder pull-to-refresh",()=>{
 assert.match(screen,/<ScrollView ref=\{lijstRef\}/);
 assert.doesNotMatch(screen,/RefreshControl/);
 assert.match(screen,/<RitverloopStop/);
});
