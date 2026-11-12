import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { API_BASE } from "./api";
import { deviceSession } from "./deviceSecureApi";
import { freshApiUrl } from "./freshRequest";
import type { FavLijn, Vertrek } from "./types";

export const PUSH_KANAAL = "ovspot-meldingen";

// Meldingen ook tonen als de app open staat.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false
  })
});

async function post<T = { ok: boolean }>(actie: string, body: unknown): Promise<T & { ok: boolean; fout?: string }> {
  const session = await deviceSession(API_BASE);
  const res = await fetch(freshApiUrl(API_BASE, "/secure/push/" + actie), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-OVspot-Device-ID": session.deviceId },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const uit = await res.json().catch(() => ({ ok: false }));
  if (!res.ok || !uit.ok) throw new Error(uit.fout || "Push niet gelukt (" + res.status + ")");
  return uit;
}

/** Vraagt toestemming en geeft het FCM-token, of null als dat niet lukt of geweigerd is. */
export async function vraagToken(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
  await Notifications.setNotificationChannelAsync(PUSH_KANAAL, {
    name: "OVspot meldingen", importance: Notifications.AndroidImportance.HIGH
  });
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;
  const token = await Notifications.getDevicePushTokenAsync();
  return typeof token.data === "string" ? token.data : null;
}

/** Meldt dit toestel aan (of bij met nieuwe favoriete lijnen). Geeft false zonder toestemming. */
export async function registreerPush(lijnen: FavLijn[], storingen: boolean): Promise<boolean> {
  const token = await vraagToken();
  if (!token) return false;
  await post("registreer", {
    token, storingen,
    lijnen: lijnen.map(f => ({ lijn: f.lijn, halte_id: f.halte.id, modus: f.modus }))
  });
  return true;
}

/** Wekker voor één vertrek: `minuten` vóór de (live) vertrektijd. */
export async function zetWekker(halteId: string, v: Vertrek, minuten: number, lijnen: FavLijn[], storingen: boolean): Promise<void> {
  const trip = v.rit?.trip;
  if (!trip || typeof v.vertrek_ms !== "number") throw new Error("Dit vertrek heeft geen wekker");
  if (!(await registreerPush(lijnen, storingen))) throw new Error("Geen toestemming voor meldingen");
  // vertrek_ms is de verwachte tijd; de server rekent met de geplande tijd + live vertraging.
  const gepland = Math.floor((v.vertrek_ms - Math.max(0, v.vertraging_min || 0) * 60000) / 1000);
  await post("wekker", {
    stop_id: halteId, rit_key: trip, lijn: v.lijn, bestemming: v.bestemming, modus: v.modus,
    gepland_ts: gepland, minuten
  });
}
