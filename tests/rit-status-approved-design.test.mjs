import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const screen = readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url), "utf8");
const stop = readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url), "utf8");

test("Goedgekeurde platte statusstrook is 56dp zonder rand of extra busicoon", () => {
  assert.match(screen, /<Text style=\{s\.statusTitel\} numberOfLines=\{1\}>\{status\}<\/Text>/);
  assert.match(screen, /t\(afwijkingTekst\(statusAfwijkingMin\)\)/);
  assert.match(screen, /<Text style=\{s\.tussen\} numberOfLines=\{1\}>/);
  assert.match(screen, /paar \? t\("Tussen"\) \+ " " \+ paar/);
  assert.match(screen, /status: \{ height: 56, backgroundColor: P\.strip/);
  assert.doesNotMatch(screen, /<View style=\{s\.statusBus\}|<View style=\{s\.statusScheiding\}/);
});

test("Geen Jouw halte of extra haltekaart; GPS-chip is gekoppeld aan echte GPS", () => {
  assert.match(screen, /t\(gpsStatus\)/);
  assert.doesNotMatch(screen + stop, /Jouw halte|<VolgendeHalteKaart|<NextStopBanner/);
  assert.match(screen, /const actueel = isGpsActueel\(gps, nu\)/);
  assert.match(screen, /const segment = rit && actueel && !rit\.vervallen/);
});

test("In de tijdlijn staan alleen de haltenamen, nooit een tweede plaatsregel", () => {
  assert.match(stop, /numberOfLines=\{1\}>\{naam\}<\/Text>/);
  assert.doesNotMatch(stop, /<Text style=\{s\.city\}|<Text style=\{s\.plaats\}|const showCity/);
  assert.match(screen, /const height = r\.index === volgendeIndex \? 64 : 48/);
  assert.match(screen, /const prevHeight = r\.index - 1 === volgendeIndex \? 64 : 48/);
});

test("Status heeft twee compacte regels, lange namen worden veilig ingekort", () => {
  assert.match(screen, /statusRegel: \{ height: 22/);
  assert.match(screen, /tussen: \{ fontSize: 13/);
  assert.match(screen, /numberOfLines=\{1\}/);
});
