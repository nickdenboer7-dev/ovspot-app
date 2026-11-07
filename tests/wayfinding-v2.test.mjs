import test from "node:test";
import assert from "node:assert/strict";
import { rangschikZoekresultaten, geldigeLijnen, positieBevestigd, positieTekst, ritBannerTitel, ritBronLabel, gpsVersheidLabel } from "../lib/wayfindingV2.ts";
import { groepeerDichtbijHaltes } from "../lib/dichtbijClusters.ts";

function stop(id, naam, plaats="Amsterdam") {
  return { id, naam, plaats, modi:["bus"], lijnen_aantal:2, lat:null, lon:null };
}
test("Leidse: vier gelijknamige haltgroepen voor overige plaatsen, intern stabiel", () => {
  const inList=[
    stop("a","Leidseplein"),stop("b","Leidseplein"),
    stop("c","Leidsebuurt","Oegstgeest"),stop("d","Leidsevaartweg","Heemstede"),
    stop("e","Leidseplein"),stop("f","Leidsewallen","Leiden"),
    stop("g","Leidseplein"),stop("h","Leidsevaart","Lisse")
  ];
  const out=rangschikZoekresultaten(inList,"Leidse");
  assert.deepEqual(out.slice(0,4).map(x=>x.id),["a","b","e","g"]);
  assert.deepEqual(out.slice(4).map(x=>x.id),["c","d","f","h"]);
});
test("Exact match staat boven gedeeltelijke hit",()=>{
  const out=rangschikZoekresultaten([stop("a","Leidseplein"),stop("b","Leidse")],"Leidse");
  assert.equal(out[0].id,"b");
});
test("Geen verwisseling van IDs of verdwijning van results",()=>{
  const data=[stop("a","Centraal Station"),stop("b","Centraal Station"),stop("c","Stationstraat")];
  assert.deepEqual(rangschikZoekresultaten(data,"Amsterdam Centraal").map(x=>x.id),["a","b","c"]);
});
test("Veilige echte lijncatalogus, optioneel, zonder hardcodering",()=>{
  assert.deepEqual(geldigeLijnen(undefined),[]);
  const v=[{lijn:"N47",modus:"bus",vervoerder:"CXX"},{lijn:"N47",modus:"bus",vervoerder:"CXX"},{lijn:"3",modus:"tram",vervoerder:"GVB"},{lijn:"",modus:"bus",vervoerder:"CXX"},{lijn:"N57",modus:"bus",vervoerder:"CXX"}];
  assert.deepEqual(geldigeLijnen(v).map(x=>x.lijn),["N47","3","N57"]);
});
test("Zonder bevestigd GPS mag NOOIT Nu hier verschijnen",()=>{
  for (const position of [false,undefined,null]) {
    const r={positie_betrouwbaar:position,nu_hier:{bij_halte:true,na_index:0,volgende_index:0,volgende_naam:"Centraal",over_min:0,gps_leeftijd_s:null}};
    assert.equal(positieBevestigd(r),false);
    assert.equal(positieTekst(r),"Volgende halte (KV8)");
  }
  assert.equal(positieTekst({positie_betrouwbaar:true,nu_hier:null}),"");
  assert.equal(positieTekst({positie_betrouwbaar:true,nu_hier:{bij_halte:true}}),"Nu hier");
});


test("KV8 live zonder GPS: neutrale bron en nooit groene rijstatus", () => {
  const rit={ live:true, rit_status:"DRIVING", positie_betrouwbaar:false,
    live_positie:false, nu_hier:{bij_halte:false,na_index:4,volgende_index:5,volgende_naam:"Station Noord",over_min:3,gps_leeftijd_s:null} };
  assert.equal(ritBannerTitel(rit),"Live tijden");
  assert.equal(ritBronLabel(rit),"KV8 halteberichten");
  assert.equal(positieBevestigd(rit),false);
  assert.equal(positieTekst(rit),"Volgende halte (KV8)");
});

test("Exact GPS bevestigd: Rijdt nu met GPS-leeftijd, geen dubbele Op tijd", () => {
  const rit={live:true,rit_status:"DRIVING",positie_betrouwbaar:true,live_positie:true,
    nu_hier:{bij_halte:false,volgende_index:2,gps_leeftijd_s:11}};
  assert.equal(ritBannerTitel(rit),"Rijdt nu");
  assert.equal(ritBronLabel(rit),"GPS actueel");
  assert.equal(positieTekst(rit),"Nu hier");
});

test("KV8 ARRIVED zonder GPS mag geen bevestigd Bij halte krijgen", () => {
  const rit={live:true,rit_status:"ARRIVED",positie_betrouwbaar:false,
    nu_hier:{bij_halte:true,volgende_index:3,gps_leeftijd_s:null}};
  assert.equal(ritBannerTitel(rit),"Live tijden");
  assert.equal(positieTekst(rit),"Bij halte gemeld (KV8)");
  assert.equal(ritBronLabel(rit),"KV8 halteberichten");
});

test("Gepland en live tijden zonder KV8-positie tonen geen GPS-waarschuwing", () => {
  const gepland={live:false,rit_status:"SCHEDULED",nu_hier:null};
  const live={live:true,rit_status:"SCHEDULED",nu_hier:null};
  assert.equal(ritBannerTitel(gepland),"Dienstregeling");
  assert.equal(ritBannerTitel(live),"Live tijden");
  assert.equal(ritBronLabel(gepland),null);
  assert.equal(ritBronLabel(live),null);
});

test("INCOMING en verbindingsfout blijven expliciet, zonder geschatte GPS", () => {
  const incoming={live:true,rit_status:"INCOMING",status_omschrijving:"Onderweg naar beginhalte",
    voertuig_info:{nummer:"4404",leeftijd_s:9}};
  assert.equal(ritBannerTitel(incoming),"Onderweg naar beginhalte");
  assert.equal(ritBronLabel(incoming),"GPS actueel");
  assert.equal(ritBronLabel(incoming,true),"Verbinding kwijt");
  assert.equal(ritBronLabel({...incoming,voertuig_info:null}),"Positie geschat");
});


test("GPS-leeftijd: grens 45 s is GPS actueel, geen secondenteller", () => {
  for (const age of [0, 11, 20, 45]) assert.equal(gpsVersheidLabel(age), "GPS actueel");
});

test("GPS-leeftijd 46 t/m 120 s: Live bijgewerkt", () => {
  for (const age of [45.01, 46, 87, 120]) assert.equal(gpsVersheidLabel(age), "Live bijgewerkt");
});

test("GPS-ouder of onbekend: Positie geschat", () => {
  for (const age of [120.01, 121, 900, null, undefined, -1, Infinity, NaN]) {
    assert.equal(gpsVersheidLabel(age), "Positie geschat");
  }
});

test("KV8 zonder GPS blijft KV8 en krijgt nooit GPS actueel", () => {
  const rit={ live:true, rit_status:"DRIVING", live_positie:false, positie_betrouwbaar:false,
    gps_leeftijd_s:20, nu_hier:{volgende_index:1,gps_leeftijd_s:null} };
  assert.equal(ritBronLabel(rit), "KV8 halteberichten");
  assert.equal(ritBannerTitel(rit), "Live tijden");
});


function nearby(id, naam, lat, lon, afstand_m, bestemming, vertrek_ms, plaats="Leeuwarden") {
  return { id, naam, plaats, lat, lon, afstand_m, modi:["bus"], lijnen:["4"],
    storingen_aantal:0, fout:null, vertrekken:bestemming ? [
      {lijn:"4",lijn_naam:"4",modus:"bus",bestemming,vervoerder:"ARR", gepland:"15:30",verwacht:"15:30",
       vertrek_ms,vertraging_min:0,live:false,vervallen:false,spoor:"",rit:{trip:id+"-trip",datum:"2026-11-07"}}
    ] : [] };
}

test("Bordineweg echte GTFS-haltepalen op 17m: één kaart, kortste afstand en twee richtingen", () => {
  const a=nearby("3963266","Bordineweg",53.189927,5.779958,309,"Busstation",1794063240000);
  const b=nearby("4221184","Bordineweg",53.189791,5.779847,320,"Nijlân",1794064440000);
  const source=[a,b];
  const out=groepeerDichtbijHaltes(source);
  assert.equal(out.length,1);
  assert.equal(out[0].id,"3963266");
  assert.equal(out[0].afstand_m,309);
  assert.deepEqual(out[0].haltes.map(x=>x.id),["3963266","4221184"]);
  assert.deepEqual(out[0].vertrekken.map(x=>[x.halteId,x.vertrek.bestemming]),
    [["3963266","Busstation"],["4221184","Nijlân"]]);
  assert.deepEqual(source,[a,b]); // Geen mutatie van API-antwoorden.
});

test("Overstaande haltes meer dan 80m uit elkaar mogen niet samenvoegen", () => {
  const x=nearby("a","Bordineweg",53.189927,5.779958,200,"Busstation",1000);
  const y=nearby("b","Bordineweg",53.191000,5.779958,210,"Nijlân",2000);
  assert.equal(groepeerDichtbijHaltes([x,y]).length,2);
});

test("Exacte naam en plaats vereist voor clusteren, ook bij palen op 5m", () => {
  const x=nearby("a","Bordineweg",53.189927,5.779958,200,"Busstation",1000);
  const y=nearby("b","Bordine weg",53.189937,5.779958,210,"Nijlân",2000);
  const z=nearby("c","Bordineweg",53.189927,5.779958,220,"Nijlân",3000,"Groningen");
  assert.equal(groepeerDichtbijHaltes([x,y,z]).length,3);
});

test("Zonder coördinaten alleen opeenvolgende gelijknamige haltes samenvoegen", () => {
  const a=nearby("a","Bordineweg",null,null,100,"Busstation",1000);
  const b=nearby("b","Bordineweg",null,null,110,"Nijlân",2000);
  const c=nearby("c","Uiterdijksterweg",null,null,120,"Station",3000);
  const d=nearby("d","Bordineweg",null,null,140,"Station",4000);
  const result=groepeerDichtbijHaltes([a,b,c,d]);
  assert.deepEqual(result.map(x=>x.haltes.map(y=>y.id)),[["a","b"],["c"],["d"]]);
});

test("Gecombineerde vertrekken zijn chronologisch en behouden eigen halte-ID", () => {
  const a=nearby("a","Bordineweg",53.189927,5.779958,309,"Busstation",2000);
  const b=nearby("b","Bordineweg",53.189791,5.779847,320,"Nijlân",1000);
  a.vertrekken.push({...a.vertrekken[0], vertrek_ms:4000, rit:{trip:"next",datum:"2026-11-07"}});
  b.vertrekken.push({...b.vertrekken[0], vertrek_ms:3000, rit:{trip:"later",datum:"2026-11-07"}});
  const result=groepeerDichtbijHaltes([b,a])[0];
  assert.deepEqual(result.vertrekken.map(x=>x.vertrek.vertrek_ms),[1000,2000,3000,4000]);
  assert.deepEqual(result.vertrekken.map(x=>x.halteId),["b","a","b","a"]);
  assert.equal(result.id,"a"); // Kortste loopafstand, ongeacht API-volgorde.
});

test("Bij dezelfde rit/tijd geen dubbele vertrekregels in de samengestelde kaart", () => {
  const a=nearby("a","Bordineweg",53.189927,5.779958,309,"Busstation",2000);
  const b=nearby("b","Bordineweg",53.189791,5.779847,320,"Busstation",2000);
  b.vertrekken[0].rit = a.vertrekken[0].rit;
  assert.equal(groepeerDichtbijHaltes([a,b])[0].vertrekken.length,1);
});

test("Kaart van één paal blijft ongewijzigd met max twee vertrekken", () => {
  const a=nearby("a","Uiterdijksterweg",53.18779,5.780784,100,"Busstation",1000);
  a.vertrekken.push({...a.vertrekken[0],vertrek_ms:2000,rit:{trip:"b",datum:"2026-11-07"}});
  a.vertrekken.push({...a.vertrekken[0],vertrek_ms:3000,rit:{trip:"c",datum:"2026-11-07"}});
  const result=groepeerDichtbijHaltes([a]);
  assert.equal(result.length,1);
  assert.deepEqual(result[0].vertrekken.map(x=>x.vertrek.vertrek_ms),[1000,2000]);
});
