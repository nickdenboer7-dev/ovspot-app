// One-off cross-language integration check against HTTPS production.
// Creates a disposable test installation; no production private keys.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { bytesToHex } from "@noble/hashes/utils";
import { decryptDeviceResponse, publicKeyFromPrivate } from "./lib/deviceCrypto.ts";

const base = "https://ovspot.nl/app/v1";
const privateKey = bytesToHex(randomBytes(32));
const publicKey = publicKeyFromPrivate(privateKey);
const registered = await fetch(base+"/secure/register", {
  method: "POST",
  headers: {"Content-Type":"application/json"},
  body: JSON.stringify({public_key:publicKey}),
});
const reg = await registered.json();
assert.equal(registered.status,200);
assert.equal(reg.ok,true);
const id = reg.device_id;
const suffix = "/lijnvertrekken?halte_id=2993405&line=97&modus=bus&cluster=1&_fresh=nodetest";
const response = await fetch(base+"/secure"+suffix, {
  headers: {"X-OVspot-Device-ID":id,"Cache-Control":"no-store"},
});
const envelope = await response.json();
assert.equal(response.status,200);
assert.equal(response.headers.get("X-OVspot-Sealed"),"v1");
assert.equal("vertrekken" in envelope,false);
const data = decryptDeviceResponse(envelope,privateKey,id,"/app/v2"+suffix);
assert.equal(data.ok,true);
assert.ok(Array.isArray(data.vertrekken));
const wrongPrivate = bytesToHex(randomBytes(32));
assert.throws(()=>decryptDeviceResponse(envelope,wrongPrivate,id,"/app/v2"+suffix));
console.log("PRODUCTION_CROSS_LANGUAGE_PASS","departures",data.vertrekken.length,"sealed_body_bytes",JSON.stringify(envelope).length);
