import test from "node:test";
import assert from "node:assert/strict";
import { rangschikZoekresultaten, geldigeLijnen, positieBevestigd, positieTekst, ritBannerTitel, ritBronLabel } from "../lib/wayfindingV2.ts";

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
  assert.equal(ritBronLabel(rit),"GPS 11s oud");
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
  assert.equal(ritBronLabel(incoming),"GPS 9s oud");
  assert.equal(ritBronLabel(incoming,true),"Verbinding kwijt");
  assert.equal(ritBronLabel({...incoming,voertuig_info:null}),null);
});
