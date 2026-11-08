import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { bytesToHex } from "@noble/hashes/utils";
import { decryptDeviceResponse, publicKeyFromPrivate, type EncryptedEnvelope } from "./deviceCrypto";

const PRIVATE_KEY = "ovspot_install_x25519_private_v1";
const DEVICE_ID = "ovspot_install_device_id_v1";
type Session = { privateKey: string; deviceId: string };
let pendingSession: Promise<Session> | null = null;

function requireHttps(base: string): void {
  const url = new URL(base);
  if (url.protocol !== "https:" || url.hostname !== "ovspot.nl") {
    throw new Error("OVspot requires HTTPS on the official API server");
  }
}

async function register(base: string, pub: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(base + "/secure/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ public_key: pub }),
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok || body?.ok !== true ||
        typeof body.device_id !== "string" || !/^[0-9a-f]{40}$/.test(body.device_id)) {
      throw new Error("Device registration failed");
    }
    return body.device_id;
  } finally {
    clearTimeout(timeout);
  }
}

async function openSession(base: string): Promise<Session> {
  requireHttps(base);
  let privateKey = await SecureStore.getItemAsync(PRIVATE_KEY);
  if (!privateKey) {
    // Native OS CSPRNG. This and SecureStore require a NEW Android binary.
    privateKey = bytesToHex(await Crypto.getRandomBytesAsync(32));
    await SecureStore.setItemAsync(PRIVATE_KEY, privateKey);
  }
  const pub = publicKeyFromPrivate(privateKey);
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID);
  if (!deviceId || !/^[0-9a-f]{40}$/.test(deviceId)) {
    deviceId = await register(base, pub);
    await SecureStore.setItemAsync(DEVICE_ID, deviceId);
  }
  return { privateKey, deviceId };
}

export function deviceSession(base: string): Promise<Session> {
  if (!pendingSession) pendingSession = openSession(base).catch((error) => {
    pendingSession = null;
    throw error;
  });
  return pendingSession;
}

export async function resetDeviceRegistration(): Promise<void> {
  pendingSession = null;
  await SecureStore.deleteItemAsync(DEVICE_ID);
}

/** Only the sealed /app/v1/secure/ path is used. No plaintext network fallback. */
export async function decryptApiBody(
  envelope: EncryptedEnvelope, session: Session, actualUrl: string
): Promise<unknown> {
  const url = new URL(actualUrl);
  if (url.protocol !== "https:" || url.hostname !== "ovspot.nl" ||
      !url.pathname.startsWith("/app/v1/secure/")) {
    throw new Error("Unexpected encrypted API URL");
  }
  const originalPath = url.pathname.replace(/^\/app\/v1\/secure\//, "/app/v2/") + url.search;
  return decryptDeviceResponse(envelope, session.privateKey, session.deviceId, originalPath);
}
