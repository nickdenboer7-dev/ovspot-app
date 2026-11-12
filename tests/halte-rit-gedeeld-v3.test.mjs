import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bepaalRitStatus, rondAfwijkingMinuten, tijdTotVertrek,
  liveBalkTekst, heeftActueelLive, jouwHalteIndex, toonVolgendeHighlight,
  vertrekHalteOmschrijving
} from "../lib/ritStatus.ts";
import { lijnKleur } from "../constants/wayfinding.ts";
import { bouwRitV2Haltes, volgendeHalteTekst } from "../lib/ritverloopV2.ts";

const src = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const bord = src("app/halte/[id].tsx");
const rit = src("components/RitverloopV2Screen.tsx");
const halte = src("components/RitverloopStop.tsx");
const badge = src("components/ui.tsx");
const tijdcel = src("components/RitTijdcel.tsx");
const liveBalk = src("components/LiveBalk.tsx");
const bar = src("components/OVspotSchermKop.tsx");

test("Operator badge Qbuzz lijn 1 is orange on board and trip; metro keeps line colors", () => {
  assert.equal(lijnKleur("1","bus","Qbuzz").bg, "#ff9622");
  assert.equal(lijnKleur("1","bus","Qbuzz","00A3E0").bg, "#ff9622");
  assert.equal(lijnKleur("52","metro","GVB").bg, "#00adef");
  assert.match(badge, /const palet = lijnKleur\(lijn, modus, vervoerder, kleur, tekstkleur\)/);
  assert.match(bord, /<VertrekRegel /);
  assert.match(rit, /<RitKop/);
  assert.match(bar, /<LijnBadge groot/);
});

test("One shared status source covers scheduled, on-time, delay, early and cancelled", () => {
  const cases = [
    [false, false, 1, "Gepland", "gepland", false],
    [true, false, 0, "Live op tijd", "op_tijd", true],
    [true, false, 1, "Vertraagd +1 min", "vertraagd", true],
    [true, false, -1, "Te vroeg 1 min", "te_vroeg", true],
    [true, true, 1, "Vervallen", "vervallen", false],
  ];
  for (const [live, vervallen, afwijkingMin, tekst, soort, heeftLive] of cases) {
    const got = bepaalRitStatus({live,vervallen,afwijkingMin});
    assert.equal(got.tekst,tekst);
    assert.equal(got.soort,soort);
    assert.equal(got.heeftLive,heeftLive);
  }
  assert.match(src("components/RitStatusLabel.tsx"), /bepaalRitStatus/);
  assert.match(tijdcel, /bepaalRitStatus/);
  assert.match(rit, /<StatusStrook/);
  assert.match(bord, /<StatusStrook/);
});

test("80 seconds rounds once to +1 min; early -80 seconds rounds to -1", () => {
  assert.equal(rondAfwijkingMinuten(80),1);
  assert.equal(rondAfwijkingMinuten(-80),-1);
  assert.equal(rondAfwijkingMinuten(89),1);
  assert.equal(rondAfwijkingMinuten(90),2);
  assert.equal(rondAfwijkingMinuten(20),0);
  const base = Date.parse("2026-11-10T04:06:20+01:00");
  const fake = {live:true,haltes:[{id:"julianalaan",naam:"Leeuwarden, Julianalaan",plaats:"Leeuwarden",
    gepland:"04:05", verwacht:"04:06", tijd_ms:base, live_tijd:true, vertraging_min:1,
    status:"komt", vervalt:false,spoor:"F"}]};
  const stops = bouwRitV2Haltes(fake,null);
  assert.equal(stops[0].vertragingMin,1);
  assert.equal(stops[0].verwacht,"04:06");
  assert.equal(stops[0].live,true);
});

test("Same expected/plan/delta fields drive both time cells; early purple and cancelled", () => {
  assert.match(src("components/VertrekRegel.tsx"), /<RitTijdcel/);
  assert.match(halte, /<RitTijdcel/);
  assert.match(tijdcel, /afwijkingMin=|afwijkingMin,/);
  assert.match(tijdcel, /s.plan/);
  assert.match(tijdcel, /textDecorationLine: "line-through"/);
  assert.match(tijdcel, /colors\.early/);
  assert.match(tijdcel, /vervallen \? gepland \|\| verwacht/);
  assert.match(src("components/RitStatusLabel.tsx"), /"vervallen"/);
});

test("59/60/297 minute formatting and post-24h absolute date", () => {
  const nu = Date.parse("2026-11-10T00:22:00+01:00");
  assert.equal(tijdTotVertrek(nu + 59*60000,nu),"over 59 min");
  assert.equal(tijdTotVertrek(nu + 60*60000,nu),"over 1 u 0 min");
  assert.equal(tijdTotVertrek(nu + 297*60000,nu),"over 4 u 57 min");
  assert.equal(tijdTotVertrek(nu + 20_000,nu),"aankomend");
  assert.equal(volgendeHalteTekst(nu+20_000,nu),"Volgende halte · aankomend");
  assert.match(tijdTotVertrek(nu + 24*3600_000+60_000,nu),/11 nov.*00:23/);
  assert.doesNotMatch(tijdTotVertrek(nu + 297*60000,nu),/over 297 min/);
});

test("Only live source with recent timestamp turns the shared dot green", () => {
  const nu=1000000;
  assert.equal(liveBalkTekst(false,nu-1000,nu),"Dienstregeling · geen live gegevens");
  assert.equal(liveBalkTekst(true,null,nu),"Dienstregeling · geen live gegevens");
  assert.equal(liveBalkTekst(true,nu-1000,nu),"Live · bijgewerkt 1 s geleden");
  assert.equal(liveBalkTekst(true,nu-200000,nu),"Dienstregeling · geen live gegevens");
  assert.equal(heeftActueelLive(false,nu-500,nu),false);
  assert.equal(heeftActueelLive(true,nu-500,nu),true);
  assert.match(liveBalk, /isLive \? colors.live : colors.muted/);
  assert.match(bord, /<LiveBalk/);
  assert.match(rit, /<LiveBalk/);
});

test("Julianalaan is marked only with a board-provided stop identifier", () => {
  const hs=[{id:"B",naam:"Leeuwarden, Bordineweg"},{id:"J",naam:"Leeuwarden, Julianalaan"}];
  assert.equal(jouwHalteIndex(hs,"J","Leeuwarden, Julianalaan"),1);
  assert.equal(jouwHalteIndex(hs,undefined,undefined),-1);
  assert.equal(jouwHalteIndex(hs,undefined,"Leeuwarden, Julianalaan"),1);
  assert.equal(jouwHalteIndex(hs,undefined,"Andere halte"),-1);
  assert.match(rit, /onLayout=\{isJouwHalte && !!ref.instap_halte \? e =>/);
  assert.match(rit, /eenmaalGesprongenNaarHalte.current === uniekeSleutel/);
  assert.match(halte, /Jouw halte/);
});

test("Never highlight a future stop as a moving vehicle without confirmed projected GPS", () => {
  assert.equal(toonVolgendeHighlight(false,false),false);
  assert.equal(toonVolgendeHighlight(false,true),false);
  assert.equal(toonVolgendeHighlight(true,false),false);
  assert.equal(toonVolgendeHighlight(true,true),true);
  assert.match(rit, /volgende=\{rijdend && r.index === volgendeIndex\}/);
  assert.match(rit, /vertrekhalte=\{nogNietVertrokken && r.index === 0\}/);
  assert.match(rit, /Geen voertuig-GPS/);
  assert.match(rit, /Gepland/);
  assert.match(rit, /vertrekOver/);
});

test("Long Jouw halte with 1.3 text scale expands instead of truncating or overlapping", () => {
  assert.match(halte, /fontScale >= 1.3/);
  assert.match(halte, /minHeight: markeer \? \(groteTekst \? 100 : 82\)/);
  assert.match(halte, /numberOfLines=\{markeer \? undefined : 1\}/);
  assert.match(halte, /jouwChip: \{ borderWidth: 1/);
  assert.match(halte, /labelColumn: \{ flex: 1, minWidth: 0/);
  assert.doesNotMatch(halte, /substring\(|name\.slice\(/);
});

test("Existing board filters, favorites, disruptions tab and route map remain available", () => {
  assert.match(bord,/setSelectedLine\(lijn === geselecteerdeLijn && !richtingActief \? null : lijn\)/);
  assert.match(bord,/wisselModus\(tabModi\[volgende\]\)/);
  assert.match(bord,/storingenOpen \? storingen.map/);
  assert.match(bord,/onFavoriet=\{\(\) => wisselFavoriet/);
  assert.match(rit,/const onFavoriet = lijnFavoriet \? \(\) => wisselLijnFavoriet\(lijnFavoriet\)/);
  assert.match(rit,/onFavoriet=\{onFavoriet\}/);
  assert.match(rit,/<LiveRitKaart/);
  assert.match(rit,/<OnderBalk actief=\{van\} \/>/);
  assert.match(bord,/<OnderBalk actief=\{van\} \/>/);
});

test("Departure location never repeats a platform already included in stop name", () => {
  assert.equal(vertrekHalteOmschrijving("Leeuwarden, Busstation (Perron E)", "Perron E"),
    "Leeuwarden, Busstation (Perron E)");
  assert.equal(vertrekHalteOmschrijving("Busstation", "Perron F"), "Busstation (Perron F)");
  assert.equal(vertrekHalteOmschrijving("Julianalaan", ""), "Julianalaan");
  assert.match(rit, /const vertrekVanaf = vertrekHalteOmschrijving\(eersteNaam, perron\)/);
});
