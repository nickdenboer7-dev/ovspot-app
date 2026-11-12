import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const lees=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Push: Firebase-config, plugin en versionCode",()=>{
  const app=JSON.parse(lees("app.json")).expo;
  assert.equal(app.android.googleServicesFile,"./google-services.json");
  assert.ok(app.android.versionCode>=5);
  assert.ok(app.plugins.includes("expo-notifications"));
  const g=JSON.parse(lees("google-services.json"));
  assert.equal(g.client[0].client_info.android_client_info.package_name,app.android.package);
});
test("Push: registratie en wekker praten met de secure push-routes en sturen halte, modus en trip mee",()=>{
  const p=lees("lib/push.ts");
  assert.match(p,/"\/secure\/push\/" \+ actie/);
  assert.match(p,/X-OVspot-Device-ID/);
  assert.match(p,/halte_id: f\.halte\.id, modus: f\.modus/);
  assert.match(p,/rit_key: trip/);
  assert.match(p,/vertraging_min \|\| 0\) \* 60000/);   // geplande tijd = verwacht - vertraging
  assert.match(p,/getDevicePushTokenAsync/);
});
test("Push: schakelaar in Instellingen, bel op haltebord, geen service-account-sleutel in de app",()=>{
  assert.match(lees("app/(tabs)/instellingen.tsx"),/titel="Storingen en vertraging"/);
  assert.match(lees("components/VertrekRegel.tsx"),/onWekker && !vertrokken && !v\.vervallen/);
  assert.match(lees("app/halte/[id].tsx"),/onWekker=\{v\.rit\?\.trip/);
  for(const f of ["lib/push.ts","app.json","google-services.json"]) assert.doesNotMatch(lees(f),/BEGIN PRIVATE KEY|private_key/);
});
