import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { uniekeHalteLijnen, filterHalteVertrekken } from "../lib/halteLijnFilter.ts";
import { lijnKleur } from "../constants/wayfinding.ts";

const bron = readFileSync(new URL("../app/halte/[id].tsx", import.meta.url), "utf8");

const vertrek = (lijn, modus="bus", tijd=0, extra={}) => ({
  lijn, modus, vertrek_ms:tijd, vervoerder:"Qbuzz",
  bestemming:"Harlingen", gepland:"09:00", verwacht:"09:00",
  vertraging_min:0, live:true, vervallen:false, spoor:"",
  rit:{trip:String(tijd),datum:"2026-11-08"}, ...extra
});

test("Eén unieke vaste lijn blijft als chip zichtbaar, ook zonder vertrek", () => {
  const vertrekTabel = [vertrek("71", "bus", 1), vertrek("71", "bus", 2)];
  const lijnen = uniekeHalteLijnen(vertrekTabel);
  assert.equal(lijnen.length,1);
  assert.equal(lijnen[0].lijn,"71");
  assert.match(bron,/\{uniekeLijnen.length >= 1 \? \(/);
  assert.equal(uniekeHalteLijnen([]).length,0);
});

test("Harlingen RS2, Qbuzz 71/99: één chip per unieke lijn en volgorde blijft gelijk", () => {
  const ritten = [
    vertrek("RS2","train",100,{vervoerder:"Arriva"}),
    vertrek("71","bus",200,{kleur:"#FF9622"}),
    vertrek("99","bus",300),
    vertrek("RS2","train",400,{vervoerder:"Arriva"}),
    vertrek("71","bus",500)
  ];
  assert.deepEqual(uniekeHalteLijnen(ritten).map(x=>x.lijn),["RS2","71","99"]);
  assert.deepEqual(filterHalteVertrekken(ritten,"alles","71").map(x=>x.vertrek_ms),[200,500]);
  assert.deepEqual(filterHalteVertrekken(ritten,"alles",null).map(x=>x.vertrek_ms),[100,200,300,400,500]);
  assert.deepEqual(filterHalteVertrekken(ritten,"bus",null).map(x=>x.lijn),["71","99","71"]);
  assert.deepEqual(filterHalteVertrekken(ritten,"train","71"),[]);
});

test("Routekleuren en GTFS-kleur worden meegenomen zonder ongeldige lege chips",()=>{
  const lines = uniekeHalteLijnen([
    vertrek("  ", "bus", 1),
    vertrek("1", "tram", 2, {kleur:"#CB3B2C",vervoerder:"GVB"}),
    vertrek("1", "tram", 3),
    vertrek(" 52 ", "metro", 4, {vervoerder:"GVB"})
  ]);
  assert.deepEqual(lines.map(l=>l.lijn),["1","52"]);
  assert.equal(lines[0].kleur,"#CB3B2C");
  assert.equal(lijnKleur(lines[1].lijn,lines[1].modus,lines[1].vervoerder).bg,"#00adef");
  const later = uniekeHalteLijnen([
    vertrek("99", "bus", 1), vertrek("99", "bus", 2, {kleur:"#FF9622"})
  ]);
  assert.equal(later[0].kleur,"#FF9622");
});

test("Een chip wordt opnieuw Alles bij tweede tik; na moduswissel reset selectie",()=>{
  assert.match(bron,/const \[selectedLine, setSelectedLine\] = useState<string \| null>\(null\)/);
  assert.match(bron,/setSelectedLine\(lijn === geselecteerdeLijn \? null : lijn\)/);
  assert.match(bron,/zichtbareStatischeLijnen\(statischeLijnen, actieveModus\)/);
  assert.match(bron,/const geselecteerdeLijn = selectedLine && uniekeLijnen.some/);
  assert.match(bron,/filterHalteVertrekken\(h\?\.vertrekken \?\? \[\], actieveModus, geselecteerdeLijn\)/);
  assert.match(bron,/wisselModus\(tabModi\[volgende\]\)/);
  assert.match(bron,/onKies=\{wisselModus\}/);
  assert.match(bron,/setGekozenModus\(modus\);\s*setSelectedLine\(null\);\s*setLijnZoektekst\(""\)/);
  assert.doesNotMatch(bron,/const volgendeModus = tabModi.includes\("alles"\) \? "alles" : passendeModus/);
});

test("Scrollbare chipbalk onder Bijgewerkt-header, kleurcontrast en toegankelijkheid",()=>{
  const vanafHeader=bron.search(/<OVspotSchermKop/);
  const vanafModus=bron.indexOf("{meerdereModi ? (",vanafHeader);
  const vanafLijn=bron.indexOf("{uniekeLijnen.length >= 1 ? (",vanafModus);
  assert.ok(vanafHeader>=0 && vanafModus>vanafHeader && vanafLijn>vanafModus);
  assert.match(bron,/ScrollView horizontal showsHorizontalScrollIndicator=\{false\}/);
  assert.match(bron,/accessibilityLabel=\{t\("Alle lijnen"\)\}/);
  assert.match(bron,/accessibilityLabel=\{t\(\x60Filter op lijn \$\{lijn.lijn\}\x60\)\}/);
  assert.match(bron,/accessibilityState=\{\{ selected: actief \}\}/);
  assert.match(bron,/backgroundColor: actief \? colors.accent : "transparent"/);
  assert.match(bron,/borderColor: actief \? colors.accent : colors.border/);
  assert.match(bron,/backgroundColor: palet.bg/);
  assert.match(bron,/color: palet.fg/);
  assert.match(bron,/lijn.kleur, lijn.tekstkleur/);
});
