import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { voegStationVertrektijdenToe } from "../lib/stationGroups.ts";

const ms = t => Date.parse(`2026-11-08T${t}:00+01:00`);
const station = () => ({
  ok:true,id:"stoparea:18223",naam:"Station Harlingen",plaats:"Harlingen",
  lat:53.1704792551,lon:5.42507350445,verouderd:false,
  bijgewerkt:"2026-11-08T03:00:00+01:00",modi:["train"],storingen:[],
  vertrekken:[{lijn:"RS2",modus:"train",vertrek_ms:ms("09:15"),rit:{trip:"old",datum:"2026-11-08"}}]
});
const vertrek=(lijn,modus,t,trip)=>({
  lijn,modus,vertrek_ms:ms(t),rit:{trip,datum:"2026-11-08"},
  gepland:t,verwacht:t,bestemming:"Bestemming",vervoerder:"Qbuzz",
  vertraging_min:0,spoor:"",live:false,vervallen:false
});
const cluster = () => ({
  ok:true,halte_id:"stoparea:18223",naam:"Harlingen",
  lat:53.1704792551,lon:5.42507350445,cluster_straal_m:350,
  bijgewerkt:"2026-11-08T03:46:00+01:00",types:["bus","train"],
  nacht_fallback:true,aantal:3,
  haltes:[
    {id:"2993051",naam:"Harlingen",afstand_m:13.2,perron:"1"},
    {id:"4221360",naam:"Harlingen, Station",afstand_m:58,perron:""},
    {id:"4221361",naam:"Harlingen, Station",afstand_m:53.4,perron:""}
  ],
  vertrekken:[
    vertrek("RS2","train","09:15","rs215"),
    vertrek("71","bus","09:31","b7131"),
    vertrek("RS2","train","09:45","rs245")
  ]
});

test("350m-cluster levert Harlingen RS2 09:15, bus 71 09:31, RS2 09:45 chronologisch",()=>{
  const merged=voegStationVertrektijdenToe(station(),cluster());
  assert.deepEqual(merged.vertrekken.map(x=>[x.lijn,x.verwacht]),[
    ["RS2","09:15"],["71","09:31"],["RS2","09:45"]
  ]);
  assert.deepEqual(merged.modi,["train","bus"]);
  assert.equal(merged.bijgewerkt,cluster().bijgewerkt);
  assert.equal(merged.vertrekken.length,3);
  assert.equal(merged.storingen.length,0);
});

test("V2 wordt alleen op exact aangevraagde station-ID toegepast",()=>{
  const base=station();
  assert.equal(voegStationVertrektijdenToe(base,null),base);
  assert.equal(voegStationVertrektijdenToe(base,{...cluster(),halte_id:"ander-station"}),base);
});

test("Metro- en ferry-vertrekken uit oude endpoint blijven behouden",()=>{
  const base=station();
  base.modi.push("metro");
  base.vertrekken.push(vertrek("51","metro","09:21","metro21"));
  const merged=voegStationVertrektijdenToe(base,cluster());
  assert.deepEqual(merged.vertrekken.map(x=>x.lijn),["RS2","51","71","RS2"]);
});

test("Stationscherm haalt verse multimodale vertrektijden via expliciete v2-url",()=>{
  const api=readFileSync(new URL("../lib/api.ts",import.meta.url),"utf8");
  const board=readFileSync(new URL("../app/halte/[id].tsx",import.meta.url),"utf8");
  const back=readFileSync(new URL("../backend/board_v2.py",import.meta.url),"utf8");
  const server=readFileSync(new URL("../backend/api_v2_kv8.py",import.meta.url),"utf8");
  assert.match(back,/CLUSTER_RADIUS_M = 350/);
  assert.match(server,/2\.0\.19-static-haltelijnen/);
  assert.match(api,/stationVertrektijden: \(id: string, max = 60\)/);
  assert.match(api,/\/vertrektijden\?halte_id=\$\{encodeURIComponent\(id\)\}/);
  assert.match(api,/get<StationVertrektijden>\([\s\S]*?API_V2_BASE/);
  assert.match(api,/cache: "no-store"/);
  assert.match(api,/freshApiUrl\(base, path\)/);
  assert.match(board,/api\.stationVertrektijden\(id, 60\)/);
  assert.match(board,/stationPoll\.verversen\(\)/);
  assert.match(board,/multimodaalStation && !handmatigeModus \? "alles"/);
  assert.match(board,/const tabModi = multimodaalStation \? \["alles", \.\.\.modi\] : modi/);
  assert.doesNotMatch(board,/busstationZoekterm|busPoll/);
});
