import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normaliseerInstellingen, STANDAARD_INSTELLINGEN } from "../lib/instellingenDefaults.ts";

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
  assert.match(context,/Promise\.all\(\[leesInstellingen\(\), leesFavorieten\(\)\]\)/);
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

test("Vier gegroepeerde secties, geen Play Store knop, donker header- en kaartdesign",()=>{
  for(const label of ["WEERGAVE & GEDRAG","KAART & DATA","MELDINGEN","OVER OVSPOT"])
    assert.ok(scherm.includes('titel="'+label+'"'),label);
  for(const label of ["Thema","Startscherm","Scherm aanhouden","Live voertuigen",
                      "Databesparing","Storingen","Stuur feedback","Over de app"])
    assert.ok(scherm.includes('titel="'+label+'"'),label);
  assert.match(scherm,/ScrollView showsVerticalScrollIndicator=\{false\}/);
  assert.match(scherm,/#0F172A/);
  assert.match(scherm,/#1E293B/);
  assert.match(scherm,/borderRadius: 18/);
  assert.doesNotMatch(scherm,/Play Store|play\.google\.com/);
  assert.match(scherm,/Updates\.updateId \? Updates\.updateId\.slice\(0, 8\)/);
  assert.match(scherm,/Versie \{versie\} \(OTA: \{otaId\}\)/);
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
  assert.match(routeMap,/if \(!instellingen\.liveVoertuigen\) return/);
  assert.match(routeMap,/instellingen\.databesparing \? 15_000 : LIVE_MAP_POLL_MS/);
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
