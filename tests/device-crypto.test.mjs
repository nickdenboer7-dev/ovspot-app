import assert from "node:assert/strict";
import { test } from "node:test";
import { x25519 } from "@noble/curves/ed25519";
import { gcm } from "@noble/ciphers/aes";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { decryptDeviceResponse, publicKeyFromPrivate, DEVICE_ALGORITHM, DEVICE_PROTOCOL } from "../lib/deviceCrypto.ts";

const alice = Uint8Array.from({length:32},(_,i)=>i+1);
const bob = Uint8Array.from({length:32},(_,i)=>i+55);
const server = Uint8Array.from({length:32},(_,i)=>i+90);
const deviceId = "f".repeat(40);
const route = "/app/v2/lijnvertrekken?halte_id=2993405&line=97&_fresh=1";
const issued = 1794159000;
const privateHex = bytesToHex(alice);

function makeEnvelope(message) {
  const shared = x25519.getSharedSecret(server, x25519.getPublicKey(alice));
  const key = hkdf(sha256, shared, undefined, utf8ToBytes(DEVICE_PROTOCOL), 32);
  const nonce = new Uint8Array(12).fill(6);
  const aad = utf8ToBytes(DEVICE_PROTOCOL + "|" + deviceId + "|" + route + "|" + issued);
  const ciphertext = gcm(key, nonce, aad).encrypt(utf8ToBytes(JSON.stringify(message)));
  return { encrypted: true, version: 1, algorithm: DEVICE_ALGORITHM, issued_at: issued,
    ephemeral_key: bytesToHex(x25519.getPublicKey(server)),
    nonce: bytesToHex(nonce), ciphertext: bytesToHex(ciphertext) };
}

test("Per-device encrypted reply decrypts for the matching installation", () => {
  const msg = {ok:true, vertrekken:[{lijn:"97",bestemming:"Heerenveen"}]};
  const envelope = makeEnvelope(msg);
  assert.equal(publicKeyFromPrivate(privateHex), bytesToHex(x25519.getPublicKey(alice)));
  assert.deepEqual(decryptDeviceResponse(envelope,privateHex,deviceId,route,issued),msg);
  assert.equal("vertrekken" in envelope,false);
});

test("Different device or endpoint cannot decrypt", () => {
  const envelope = makeEnvelope({ok:true});
  assert.throws(()=>decryptDeviceResponse(envelope,bytesToHex(bob),deviceId,route,issued));
  assert.throws(()=>decryptDeviceResponse(envelope,privateHex,deviceId,route+"&changed=1",issued));
});

test("Tampered, stale or plaintext reply is rejected",()=>{
  const envelope = makeEnvelope({ok:true});
  const changed = envelope.ciphertext.slice(0,-1) + (envelope.ciphertext.endsWith("0")?"1":"0");
  assert.throws(()=>decryptDeviceResponse({...envelope,ciphertext:changed},privateHex,deviceId,route,issued));
  assert.throws(()=>decryptDeviceResponse(envelope,privateHex,deviceId,route,issued+121));
  assert.throws(()=>decryptDeviceResponse({ok:true},privateHex,deviceId,route,issued));
});
