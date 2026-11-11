import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DICHTBIJ_AFSTANDEN, normaliseerInstellingen, STANDAARD_INSTELLINGEN } from "../lib/instellingenDefaults.ts";
import { instellingKomtOvereen, instellingenZoektermen } from "../lib/instellingenZoeken.ts";

const scherm = readFileSync(new URL("../app/(tabs)/instellingen.tsx",import.meta.url),"utf8");
const opslag = readFileSync(new URL("../lib/storage.ts",import.meta.url),"utf8");
const context = readFileSync(new URL("../context/AppProvider.tsx",import.meta.url),"utf8");
const tabs = readFileSync(new URL("../app/(tabs)/_layout.tsx",import.meta.url),"utf8");
const root = readFileSync(new URL("../app/_layout.tsx",import.meta.url),"utf8");
const routeMap = readFileSync(new URL("../components/LiveRitKaart.tsx",import.meta.url),"utf8");
const buurt = readFileSync(new URL("../app/(tabs)/index.tsx",import.meta.url),"utf8");
const rit = readFileSync(new URL("../components/RitverloopV2Screen.tsx",import.meta.url),"utf8");

test("Nieuwe installatie, lege opslag en ongeldige themawaarde vallen terug op Systeem",()=>{
  assert.equal(STANDAARD_INSTELLINGEN.thema,"systeem");
  assert.equal(normaliseerInstellingen(null).thema,"systeem");
  assert.equal(normaliseerInstellingen({}).thema,"systeem");
  assert.equal(normaliseerInstellingen({thema:null}).thema,"systeem");
  assert.equal(normaliseerInstellingen({thema:"onbekend"}).thema,"systeem");
  assert.equal(normaliseerInstellingen({thema:"donker"}).thema,"donker");
  assert.equal(normaliseerInstellingen({thema:"licht"}).thema,"licht");
  assert.match(opslag,/return normaliseerInstellingen\(s\)/);
  assert.match(opslag,/AsyncStorage\.getItem/);
  assert.match(opslag,/AsyncStorage\.setItem/);
  assert.match(context,/Promise\.all\(\[leesInstellingen\(\), leesFavorieten\(\),/);
});

test("Alle zes nieuwe voorkeuren hebben veilige initwaarden, validatie en blijven bewaarbaar",()=>{
  const basis=normaliseerInstellingen({});
  assert.equal(basis.startscherm,"index");
  assert.equal(basis.schermAanhouden,false);
  assert.equal(basis.liveVoertuigen,true);
  assert.equal(basis.databesparing,false);
  assert.equal(basis.storingenPush,false);
  const gewijzigd=normaliseerInstellingen({thema:"donker",startscherm:"favorieten",
    schermAanhouden:true,liveVoertuigen:false,databesparing:true,storingenPush:true,
    filter:"bus",straal:3000});
  assert.equal(gewijzigd.thema,"donker");
  assert.equal(gewijzigd.startscherm,"favorieten");
  assert.equal(gewijzigd.schermAanhouden,true);
  assert.equal(gewijzigd.liveVoertuigen,false);
  assert.equal(gewijzigd.databesparing,true);
  assert.equal(gewijzigd.storingenPush,true);
  assert.equal(gewijzigd.filter,"bus");
  assert.equal(gewijzigd.straal,3000);
  assert.equal(normaliseerInstellingen({startscherm:"unknown",liveVoertuigen:"false"}).startscherm,"index");
  assert.equal(normaliseerInstellingen({startscherm:"unknown",liveVoertuigen:"false"}).liveVoertuigen,true);
});

test("Belangrijkste instellingen staan boven Meer instellingen; zoekresultaten blijven zichtbaar",()=>{
  for(const label of ["WEERGAVE","DICHTBIJ","MELDINGEN","KAART & DATA","GEDRAG","OVER OVSPOT"])
    assert.ok(scherm.includes('titel: "'+label+'"'),label);
  for(const label of ["Thema","Startscherm","Scherm aanhouden","Live voertuigen",
                      "Databesparing","Storingen","Stuur feedback","Over de app"])
    assert.ok(scherm.includes('titel="'+label+'"'),label);
  assert.match(scherm,/ScrollView showsVerticalScrollIndicator=\{false\}/);
  assert.match(scherm,/colors\.header/);
  assert.match(scherm,/colors\.surface2/);
  assert.match(scherm,/borderRadius: 18/);
  assert.match(scherm,/accessibilityState=\{\{ expanded: meerOpen \}\}/);
  assert.match(scherm,/zoekt \|\| meerOpen \? toonSecties\(true\)/);
  assert.doesNotMatch(scherm,/Play Store|play\.google\.com/);
  assert.match(scherm,/Updates\.updateId \? Updates\.updateId\.slice\(0, 8\)/);
  assert.match(scherm,/Versie \{versie\} \(OTA: \{otaId\}\)/);
});

test("Bestaande Dichtbij-previews blijven aan en 250 m blijft geldig na het opslaan", () => {
  assert.equal(STANDAARD_INSTELLINGEN.toonVertrekpreviews, true);
  assert.equal(normaliseerInstellingen({}).toonVertrekpreviews, true);
  assert.equal(normaliseerInstellingen({ toonVertrekpreviews: "false" }).toonVertrekpreviews, true);
  assert.equal(normaliseerInstellingen({ toonVertrekpreviews: false }).toonVertrekpreviews, false);
  assert.equal(normaliseerInstellingen({ straal: 250 }).straal, 250);
  assert.ok(DICHTBIJ_AFSTANDEN.includes(1500));
  assert.match(scherm, /zetInstellingen\(\{ toonVertrekpreviews \}\)/);
  assert.match(buurt, /toonVertrekken=\{instellingen\.toonVertrekpreviews\}/);
  assert.match(buurt, /poll\.data\?\.key === key \? poll\.data\.data : null/);
  assert.match(buurt, /vorigeHaltes = \{ key, data: nieuweData,/);
});

test("Instellingen zoeken op Nederlandse en Engelse trefwoorden en combinaties", () => {
  const zoekt = (term, titel, ...velden) => instellingKomtOvereen(instellingenZoektermen(term), titel, ...velden);
  assert.equal(zoekt("  DÓNKER  ", "Thema"), true);
  assert.equal(zoekt("gps", "Databesparing"), true);
  assert.equal(zoekt("letters", "Grotere tekst"), true);
  assert.equal(zoekt("font size", "Grotere tekst"), true);
  assert.equal(zoekt("nearby radius", "Afstand voor Dichtbij", "Nearby search radius"), true);
  assert.equal(zoekt("home location", "Thuislocatie", "Home location"), true);
  assert.equal(zoekt("radius", "Zoekafstand"), true);
  assert.equal(zoekt("preview upcoming", "Vertrektijden op haltekaarten"), true);
  assert.equal(zoekt("gps letters", "Databesparing"), false);
  assert.equal(zoekt("  ", "Thema"), true);
});

test("Thema en startscherm hebben een echte radio-modal, standaard Systeem en route-tab",()=>{
  assert.match(scherm,/<Modal visible=\{kiezer !== null\}/);
  assert.match(scherm,/\{ key: "systeem", label: "Systeem"/);
  assert.match(scherm,/\{ key: "index", label: "Dichtbij"/);
  assert.match(scherm,/\{ key: "favorieten", label: "Favorieten"/);
  assert.match(scherm,/\{ key: "storingen", label: "Storingen"/);
  assert.match(scherm,/zetInstellingen\(\{ thema: item.key as Thema \}\)/);
  assert.match(scherm,/zetInstellingen\(\{ startscherm: item.key as Startscherm \}\)/);
  assert.match(tabs,/initialRouteName=\{instellingen\.startscherm\}/);
});

test("Scherm-aanhouden gebruikt echte Expo keep-awake hook; kaart en GPS respecteren databesparing",()=>{
  assert.match(root,/import \{ useKeepAwake \} from "expo-keep-awake"/);
  assert.match(root,/useKeepAwake\("ovspot-scherm-aanhouden"\)/);
  assert.match(root,/instellingen\.schermAanhouden \? <WakkerHouden \/>/);
  assert.match(rit,/!trein && instellingen\.liveVoertuigen/);
  assert.match(rit,/instellingen\.databesparing \? 15000 : 5000/);
  assert.doesNotMatch(routeMap,/api\.liveRitVoertuig/);
  assert.match(buurt,/instellingen\.databesparing \? 600_000 : 180_000/);
  assert.match(buurt,/instellingen\.databesparing \? 60_000 : 20_000/);
  assert.match(rit,/d => instellingen\.databesparing \? \(d\?\.live \? 15000 : 60000\)/);
});

test("Feedback blijft in-app, over-pagina navigeerbaar en legacy halte/GPS-opties behouden",()=>{
  assert.match(scherm,/setFeedbackOpen\(true\)/);
  assert.match(scherm,/<FeedbackModal zichtbaar=\{feedbackOpen\}/);
  assert.match(scherm,/router\.push\("\/info"\)/);
  assert.match(scherm,/router\.push\("\/instellingen-geavanceerd"\)/);
  assert.match(root,/<Stack.Screen name="info"/);
  assert.match(root,/<Stack.Screen name="instellingen-geavanceerd"/);
  const info=readFileSync(new URL("../app/info.tsx",import.meta.url),"utf8");
  const meer=readFileSync(new URL("../app/instellingen-geavanceerd.tsx",import.meta.url),"utf8");
  assert.ok(info.includes("Licenties") && info.includes("Algemene voorwaarden"));
  assert.ok(meer.includes("Thuislocatie") && meer.includes("Afstand voor Dichtbij") && meer.includes("Standaard haltefilter"));
});
