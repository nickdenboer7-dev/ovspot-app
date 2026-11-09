import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sheet = readFileSync(new URL("../components/FeedbackModal.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../app/(tabs)/instellingen.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const appContext = readFileSync(new URL("../context/AppProvider.tsx", import.meta.url), "utf8");
const backend = readFileSync(new URL("../backend/app_feedback_v2.py", import.meta.url), "utf8");
const stop = readFileSync(new URL("../app/halte/[id].tsx", import.meta.url), "utf8");
const trip = readFileSync(new URL("../app/rit.tsx", import.meta.url), "utf8");

test("Feedbackknop opent een echt native bottom sheet, geen browser/contact-link",()=>{
  assert.match(settings,/onPress=\{\(\) => setFeedbackOpen\(true\)\}/);
  assert.match(settings,/<FeedbackModal zichtbaar=\{feedbackOpen\}/);
  assert.doesNotMatch(settings,/Linking\.openURL\("https:\/\/ovspot\.nl\/contact"\)/);
  assert.match(sheet,/<Modal[\s\S]*?transparent[\s\S]*?animationType="slide"/);
  assert.match(sheet,/const \{ colors, scheme, t \} = useApp\(\)/);
  assert.match(sheet,/borderTopLeftRadius: 26, borderTopRightRadius: 26/);
});

test("Vier categorieën, bericht en optionele e-mail worden gecontroleerd",()=>{
  for(const key of ["kaart_data","idee","bug","overig"])assert.match(sheet,new RegExp('key: "'+key+'"'));
  for(const label of ["Kaart / Data","Idee / Wens","Bug","Overig"])assert.ok(sheet.includes(label));
  assert.match(sheet,/maxLength=\{2000\}/);
  assert.match(sheet,/keyboardType="email-address"/);
  assert.match(sheet,/tekst\.length < 10/);
  assert.match(sheet,/lopend\.current = true/);
  assert.match(sheet,/client_id: berichtId\.current/);
});

test("Feedback bevat appversie, actieve OTA-update, OS-versie en recente halte/rit",()=>{
  assert.match(sheet,/app_version: Constants\.nativeAppVersion \|\| Constants\.expoConfig\?\.version/);
  assert.match(sheet,/ota_version: Updates\.updateId \|\| Updates\.runtimeVersion/);
  assert.match(sheet,/os_version: /);
  assert.match(sheet,/reported_at: new Date\(\)\.toISOString\(\)/);
  assert.match(sheet,/context: context \?\? \{ view: "instellingen" \}/);
  assert.match(appContext,/laatsteFeedbackContext: RecentFeedbackContext \| null/);
  assert.match(appContext,/zetFeedbackContext: \(context: FeedbackContext\) => void/);
  assert.match(settings,/30 \* 60 \* 1000/);
  assert.match(stop,/zetFeedbackContext\(\{ view: "halte", stop_id: id, stop_name: naam \}\)/);
  assert.match(trip,/zetFeedbackContext\(\{ view: "rit", rit_id: rit\.id, rit_datum: rit\.datum \}\)/);
});

test("HTTPS POST gebruikt bestaande admin API route; Telegram-bot blijft uitsluitend server-side",()=>{
  assert.match(api,/\$\{base\}\/api\/v2\/feedback/);
  assert.match(api,/method: "POST"/);
  assert.match(api,/body: JSON\.stringify\(payload\)/);
  assert.match(api,/setTimeout\(\(\) => controller\.abort\(\), 12000\)/);
  for(const src of [sheet,api,settings]){
    assert.doesNotMatch(src,/TELEGRAM_TOKEN|TELEGRAM_CHAT_ID|bot\d+:/);
  }
});

test("Backend gebruikt bestaande OVbord/admin app_ideas tabel en reeds opgeslagen OVspot Telegram-config",()=>{
  assert.match(backend,/BOT_CONFIG = Path\("\/home\/ubuntu\/kv15-bot\/alert_config\.sh"\)/);
  assert.match(backend,/db_path = Path\(base_dir\) \/ "app_ideas\.db"/);
  assert.match(backend,/@app\.post\("\/api\/v2\/feedback"\)/);
  assert.match(backend,/ALTER TABLE app_ideas ADD COLUMN feedback_context/);
  assert.match(backend,/source='ovspot-app'/);
  assert.match(backend,/VALUES\(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?\)/);
  assert.match(backend,/urllib\.request\.urlopen\(req, timeout=4\)/);
  assert.doesNotMatch(backend,/\d{6,15}:[A-Za-z0-9_-]{20,70}/);
});
