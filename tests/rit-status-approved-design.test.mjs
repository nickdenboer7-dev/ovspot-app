import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const screen=readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url),"utf8");
const stop=readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url),"utf8");
const shared=readFileSync(new URL("../components/StatusStrook.tsx", import.meta.url),"utf8");
test("Statusstrook gebruikt gedeelde status en exacte halte-afwijking",()=>{
 assert.match(screen,/<StatusStrook/);
 assert.match(screen,/afwijkingMin=\{statusAfwijkingMin \?\? 0\}/);
 assert.match(screen,/tussen=\{nogNietVertrokken \? undefined/);
 assert.match(shared,/<RitStatusLabel/);
 assert.doesNotMatch(screen,/statusBus|statusScheiding/);
});
test("Jouw halte uitsluitend bij opening vanuit bord, GPS-chip gekoppeld aan echte GPS",()=>{
 assert.match(screen,/const instapIndex = jouwHalteIndex/);
 assert.match(screen,/onLayout=\{isJouwHalte && !!ref.instap_halte \? e =>/);
 assert.match(screen,/chip=\{nogNietVertrokken \? "Geen voertuig-GPS" : !trein \? gpsStatus/);
 assert.match(screen,/const actueel = isGpsActueel\(gps, nu\)/);
 assert.match(screen,/\(\) => rit && actueel && !rit.vervallen/);
});
test("Ritlijst laat hele geselecteerde naam toe, andere namen compact",()=>{
 assert.match(stop,/numberOfLines=\{markeer \? undefined : 1\}>\{zichtbaarNaam\}/);
 assert.doesNotMatch(stop,/<Text style=\{s.city\}|<Text style=\{s.plaats\}|const showCity/);
 assert.match(screen,/const height = r.index === volgendeIndex && rijdend \? 58 : 44/);
 assert.match(screen,/const prevHeight = r.index - 1 === volgendeIndex && rijdend \? 58 : 44/);
});
test("Grotere tekst schaalt markering en nooit truncatie",()=>{
 assert.match(stop,/fontScale >= 1.3/);
 assert.match(stop,/numberOfLines=\{markeer \? undefined : 1\}/);
 assert.match(shared,/minHeight: 47/);
});
