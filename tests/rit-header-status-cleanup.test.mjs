import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const screen=readFileSync(new URL("../components/RitverloopV2Screen.tsx", import.meta.url),"utf8");
const stop=readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url),"utf8");
const motion=readFileSync(new URL("../components/RijdendVoertuig.tsx", import.meta.url),"utf8");
const head=readFileSync(new URL("../components/OVspotSchermKop.tsx", import.meta.url),"utf8");
const cell=readFileSync(new URL("../components/RitTijdcel.tsx", import.meta.url),"utf8");
test("OVspot-kop houdt favoriet en menu, kaartknop apart in de identiteitsrij",()=>{
 assert.match(screen,/<OVspotSchermKop favoriet=\{fav\}/);
 assert.match(head,/favoriet \? "star" : "star-outline"/);
 assert.match(screen,/icon="ellipsis-vertical"/);
 assert.match(screen,/<OVspotIdentiteit/);
 assert.match(screen,/name=\{isKaart \? "list-outline" : "map-outline"\}/);
});
test("Volgende halte alleen bij rijdend GPS-voertuig, zonder extra Nu-hier-blok",()=>{
 assert.match(stop,/backgroundColor: volgende \? colors.infoBg/);
 assert.match(stop,/volgendeHalteTekst\(verwachtMs, nu, t\)/);
 assert.match(screen,/volgende=\{rijdend && r.index === volgendeIndex\}/);
 assert.doesNotMatch(screen,/rijen\.push\(\{ soort: "nu"/);
 assert.match(stop,/<RijdendVoertuig/);
});
test("Per-halte afwijking komt uit dezelfde gedeelde tijdcel",()=>{
 assert.match(stop,/<RitTijdcel/);
 assert.match(cell,/afwijkt > 0 \? \x60\+\$\{afwijkt\}\x60/);
 assert.match(cell,/textDecorationLine: "line-through"/);
});
test("Alleen actuele, geprojecteerde GPS geeft marker en bevestigde status",()=>{
 assert.match(screen,/\(\) => rit && actueel && !rit.vervallen/);
 assert.match(screen,/chip=\{nogNietVertrokken \? "Geen voertuig-GPS" : !trein \? gpsStatus/);
 assert.match(screen,/segment && actueel && rijdend && r.index === segment.volgendeIndex/);
 assert.match(screen,/<LiveRitKaart/);
 assert.match(motion,/Animated.timing/);
});
