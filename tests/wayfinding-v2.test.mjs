import test from "node:test";
import assert from "node:assert/strict";
import { rangschikZoekresultaten, geldigeLijnen, positieBevestigd, positieTekst } from "../lib/wayfindingV2.ts";

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
    assert.equal(positieTekst(r),"Verwachte positie");
  }
  assert.equal(positieTekst({positie_betrouwbaar:true,nu_hier:null}),"");
  assert.equal(positieTekst({positie_betrouwbaar:true,nu_hier:{bij_halte:true}}),"Nu hier");
});
