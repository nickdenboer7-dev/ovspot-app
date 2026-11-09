import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");

test("Compacte statuskaart toont Onderweg, badge Op tijd en het halte-paar", () => {
  assert.match(screen, /<View style=\{s\.statusBus\}>/);
  assert.match(screen, /<View style=\{s\.statusScheiding\} \/>/);
  assert.match(screen, /<Text style=\{s\.statusTitel\} numberOfLines=\{1\}>\{status\}<\/Text>/);
  assert.match(screen, /rit\.vertraging_min === 0 \? t\("Op tijd"\)/);
  assert.match(screen, /<Text style=\{s\.tussen\} numberOfLines=\{2\}>/);
  assert.match(screen, /paar \? t\("Tussen"\) \+ " " \+ paar/);
  assert.match(screen, /status: \{ minHeight: 64/);
  assert.match(screen, /backgroundColor: "#F8FAF9"/);
});

test("Geen zichtbare GPS-chip, geen Jouw halte en geen dubbele volgende-haltekaart", () => {
  assert.doesNotMatch(screen + stop, /"GPS actueel"|"GPS verouderd"|s\.gpsChip|bronLabel/);
  assert.doesNotMatch(screen + stop, /Jouw halte|<VolgendeHalteKaart|<NextStopBanner/);
  assert.match(screen, /const actueel = isGpsActueel\(gps, nu, !!gpsPoll\.fout\)/);
  assert.match(screen, /const segment = rit && actueel && !rit\.vervallen/);
});

test("In de tijdlijn staan alleen de haltenamen, nooit een tweede plaatsregel", () => {
  assert.match(stop, /numberOfLines=\{1\}>\{naam\}<\/Text>/);
  assert.doesNotMatch(stop, /<Text style=\{s\.city\}|<Text style=\{s\.plaats\}|const showCity/);
  assert.match(screen, /const height = r\.index === volgendeIndex \? 64 : 48/);
  assert.match(screen, /const prevHeight = r\.index - 1 === volgendeIndex \? 64 : 48/);
});

test("Lange haltenamen kunnen binnen de statuskaart twee regels gebruiken", () => {
  assert.match(screen, /minWidth: 0, gap: 3/);
  assert.match(screen, /tussen: \{ fontSize: 13, lineHeight: 18/);
  assert.match(screen, /numberOfLines=\{2\}/);
});
