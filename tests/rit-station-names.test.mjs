import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const stop=readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url),"utf8");
test("Haltenaam zonder dubbel plaats-prefix, maar Jouw halte volledig leesbaar",()=>{
 assert.match(stop,/numberOfLines=\{markeer \? undefined : 1\}>\{zichtbaarNaam\}/);
 assert.match(stop,/name: \{ fontSize: 13/);
 assert.match(stop,/labelColumn: \{ flex: 1, minWidth: 0/);
});
test("Geen ongebruikte extra perronkolom en geen extra eindhaltebadges",()=>{
 assert.doesNotMatch(stop,/spoor && trein|textAlign: "right"/);
 assert.match(stop,/paddingLeft: 5/);
 assert.doesNotMatch(stop,/Eindhalte|Beginhalte|<Label/);
 assert.match(stop,/backgroundColor: volgende \? colors.infoBg/);
});
test("Ritlijst herhaalt de plaats niet als afzonderlijke tekstregel",()=>{
 assert.match(stop,/\{zichtbaarNaam\}/);
 assert.doesNotMatch(stop,/const showCity|<Text style=\{s.city\}|city: \{/);
});
