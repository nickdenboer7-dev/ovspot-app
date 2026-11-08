import { x25519 } from "@noble/curves/ed25519";
import { gcm } from "@noble/ciphers/aes";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes, bytesToUtf8 } from "@noble/hashes/utils";

export const DEVICE_PROTOCOL = "OVSPOT-DEVICE-1";
export const DEVICE_ALGORITHM = "X25519-HKDF-SHA256-AES-256-GCM";

export type EncryptedEnvelope = {
  encrypted: true;
  version: 1;
  algorithm: string;
  issued_at: number;
  ephemeral_key: string;
  nonce: string;
  ciphertext: string;
};

export function publicKeyFromPrivate(privateHex: string): string {
  if (!/^[0-9a-f]{64}$/.test(privateHex)) throw new Error("Invalid device key");
  return bytesToHex(x25519.getPublicKey(hexToBytes(privateHex)));
}

/** The server always encrypts with the device's registered X25519 public key.
 * AAD authenticates device, intended endpoint including query, and issue time.
 */
export function decryptDeviceResponse(
  envelope: EncryptedEnvelope,
  privateHex: string,
  deviceId: string,
  upstreamPath: string,
  now = Math.floor(Date.now() / 1000),
): unknown {
  if (!envelope || envelope.encrypted !== true || envelope.version !== 1 ||
    envelope.algorithm !== DEVICE_ALGORITHM) throw new Error("Unencrypted or unsupported response");
  if (!/^[0-9a-f]{40}$/.test(deviceId) || !upstreamPath.startsWith("/app/v2/")) {
    throw new Error("Invalid device binding");
  }
  if (!Number.isSafeInteger(envelope.issued_at) ||
      Math.abs(now - envelope.issued_at) > 120) throw new Error("Stale encrypted response");
  if (!/^[0-9a-f]{64}$/.test(envelope.ephemeral_key) ||
      !/^[0-9a-f]{24}$/.test(envelope.nonce) ||
      !/^[0-9a-f]+$/.test(envelope.ciphertext) ||
      envelope.ciphertext.length < 32) throw new Error("Invalid encrypted envelope");

  const shared = x25519.getSharedSecret(
    hexToBytes(privateHex), hexToBytes(envelope.ephemeral_key)
  );
  const key = hkdf(sha256, shared, undefined, utf8ToBytes(DEVICE_PROTOCOL), 32);
  const aad = utf8ToBytes(
    DEVICE_PROTOCOL + "|" + deviceId + "|" + upstreamPath + "|" + envelope.issued_at
  );
  const opened = gcm(key, hexToBytes(envelope.nonce), aad)
    .decrypt(hexToBytes(envelope.ciphertext));
  return JSON.parse(bytesToUtf8(opened));
}
