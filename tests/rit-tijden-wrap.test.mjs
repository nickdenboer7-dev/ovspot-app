import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const stop=readFileSync(new URL("../components/RitverloopStop.tsx", import.meta.url),"utf8");
const cell=readFileSync(new URL("../components/RitTijdcel.tsx", import.meta.url),"utf8");
test("Compacte tijdcel deelt afwijking en doorgestreepte planning",()=>{
 assert.match(stop,/<RitTijdcel/);
 assert.match(cell,/textDecorationLine: "line-through"/);
 assert.match(cell,/s.afwijking/);
 assert.match(stop,/s.earlyText/);
});
test("Compacte lijst heeft geen tweede aankomst/vertrek-paragraaf",()=>{
 assert.doesNotMatch(stop,/aankomst .* vertrek|s.wacht|numberOfLines=\{0\}/);
 assert.match(stop,/minHeight: markeer/);
});
test("Smalle schermen hebben volledige naamkolom zonder afkappen bij Jouw halte",()=>{
 assert.match(stop,/labelColumn: \{ flex: 1, minWidth: 0/);
 assert.match(stop,/numberOfLines=\{markeer \? undefined : 1\}/);
});
