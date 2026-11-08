import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  heeftBusstationAanvullingNodig, busstationZoekterm, kiesGekoppeldBusstation, voegBusstationToe
} from '../lib/stationGroups.ts';

const trein = (id='2993405') => ({
  ok:true,id,naam:'Station Leeuwarden',plaats:'Leeuwarden',
  lat:53.1964793547, lon:5.79295992851,
  modi:['train'],bijgewerkt:'2026-11-08T07:00:00+01:00',verouderd:false,storingen:[],
  vertrekken:[{ lijn:'IC',modus:'train',vertrek_ms:1794116220000,
    rit:{trip:'T1',datum:'2026-11-08'},bestemming:'Den Haag',spoor:'4' }]
});
const bus = () => ({
  ...trein('4221165'),naam:'Busstation',modi:['bus'],
  vertrekken:[{ lijn:'20',modus:'bus',vertrek_ms:1794115500000,
    rit:{trip:'B1',datum:'2026-11-08'},bestemming:'Dokkum',spoor:'B' }]
});

test('Leeuwarden treinbord herkent het ontbrekende busstation',()=>{
  assert.equal(heeftBusstationAanvullingNodig(trein()),true);
  assert.equal(busstationZoekterm(trein()),'Leeuwarden, Busstation');
  assert.equal(heeftBusstationAanvullingNodig({...trein(),modi:['train','bus']}),false);
});

test('zoekresultaat Leeuwarden Busstation 150m van spoor wordt correct gekoppeld',()=>{
  const results=[
    {id:'999',naam:'Busstation',plaats:'Groningen',modi:['bus'],lat:53.2,lon:5.792},
    {id:'4221165',naam:'Busstation',plaats:'Leeuwarden',modi:['bus'],lat:53.19641375,lon:5.790721375},
    {id:'123',naam:'School',plaats:'Leeuwarden',modi:['bus'],lat:53.1965,lon:5.791}
  ];
  assert.equal(kiesGekoppeldBusstation(trein(),results)?.id,'4221165');
  assert.equal(kiesGekoppeldBusstation(trein(),[results[0]]),null);
  assert.equal(kiesGekoppeldBusstation(trein(),[{...results[1],lon:5.78}]),null);
});

test('trein en bus blijven allebei zichtbaar; gesorteerd en zonder dubbele ritten',()=>{
  const out=voegBusstationToe(trein(),bus());
  assert.deepEqual(out.modi,['train','bus']);
  assert.deepEqual(out.vertrekken.map(v=>v.modus),['bus','train']);
  assert.deepEqual(out.vertrekken.filter(v=>v.modus==='bus').map(v=>v.lijn),['20']);
  assert.equal(voegBusstationToe(out,bus()).vertrekken.length,2);
});

test('andere, niet-gekoppelde haltes blijven exact zoals ze waren',()=>{
  const h=trein();
  assert.equal(voegBusstationToe(h,null),h);
  assert.equal(heeftBusstationAanvullingNodig({...h,plaats:''}),false);
});

test('haltebord heeft Trein/Bus-modusknoppen en horizontale swipe zonder verticale scroll te blokkeren',()=>{
  const code=readFileSync(new URL('../app/halte/[id].tsx',import.meta.url),'utf8');
  assert.match(code,/PanResponder\.create/);
  assert.match(code,/Math\.abs\(gesture\.dx\) > Math\.abs\(gesture\.dy\) \* 1\.4/);
  assert.match(code,/setGekozenModus\(modi\[volgende\]\)/);
  assert.match(code,/modi\.map\(modaliteitChip\)/);
  assert.match(code,/const volgorde = \["train", "metro", "tram", "bus", "ferry"\]/);
  assert.match(code,/\bvol \/>/);
  assert.match(code,/v\.modus === actieveModus/);
});
