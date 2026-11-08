import Constants from "expo-constants";
import type { Dichtbij, Filter, Halte, Rit, RitRef, LiveRitVoertuigAntwoord, StoringenAntwoord, Zoek, StationVertrektijden, LijnVertrekken, FeedbackInzending } from "./types";
import { freshApiUrl } from "./freshRequest";
import { deviceSession, decryptApiBody, resetDeviceRegistration } from "./deviceSecureApi";
import type { EncryptedEnvelope } from "./deviceCrypto";
import { dichtbijPad } from "./dichtbijQuery";

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBase?: string };
export const API_BASE = (extra.apiBase || "https://ovspot.nl/app/v1").replace(/\/$/, "");
// De nieuwe voertuig-koppeling zit uitsluitend op de zelfstandige v2-API.
export const API_V2_BASE = API_BASE.replace(/\/app\/v1$/, "/app/v2");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Nieuwe Android-build: alle GET-antwoorden via per-toestel AES-GCM-over-HTTPS.
// Nooit automatisch terugvallen op openbare JSON of een HTTP-verbinding.
async function get<T>(path: string, timeoutMs = 12000, base = API_BASE): Promise<T> {
  if (base !== API_BASE && base !== API_V2_BASE) {
    throw new ApiError("Ongeldige API-basis", 0);
  }
  let session: Awaited<ReturnType<typeof deviceSession>>;
  try {
    session = await deviceSession(API_BASE);
  } catch {
    throw new ApiError("Beveiligde toestelregistratie niet bereikbaar", 0);
  }
  // Nginx rewrite /app/v1 -> /app/v2 behoudt de live KV8-verrijking.
  const url = freshApiUrl(API_BASE, "/secure" + path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-OVspot-Device-ID": session.deviceId,
        "Cache-Control": "no-store, no-cache, max-age=0",
        Pragma: "no-cache",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("Geen beveiligde verbinding", 0);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) {
    await resetDeviceRegistration();
    throw new ApiError("Toestel opnieuw registreren. Probeer het opnieuw.", 401);
  }
  if (res.status === 304) throw new ApiError("Geen nieuw API-antwoord ontvangen", 304);
  let envelope: EncryptedEnvelope;
  try {
    envelope = await res.json() as EncryptedEnvelope;
  } catch {
    throw new ApiError("Ongeldig beveiligd API-antwoord", res.status);
  }
  let body: any;
  try {
    body = await decryptApiBody(envelope, session, url);
  } catch {
    throw new ApiError("Versleutelde gegevens konden niet worden gecontroleerd", 0);
  }
  if (!res.ok || !body?.ok) {
    throw new ApiError(body?.fout || (res.status >= 500 ? "Gegevens tijdelijk niet beschikbaar" : "Er ging iets mis"), res.status);
  }
  return body as T;
}

/** Native feedback gaat naar de reeds bestaande OVspot Flask/admin-inbox op /api/. */
async function verstuurFeedback(payload: FeedbackInzending): Promise<{ ok: boolean; id: number; stored: boolean; telegram: boolean | "duplicate" }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const base = API_BASE.replace(/\/app\/v\d+$/, "");
    const res = await fetch(`${base}/api/v2/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal
    });
    const response = await res.json().catch(() => null);
    if (!res.ok || !response?.ok || !response?.stored) {
      throw new ApiError(response?.fout || "Feedback verzenden mislukt", res.status);
    }
    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Geen verbinding. Probeer opnieuw.", 0);
  } finally {
    clearTimeout(timer);
  }
}

export function ritParams(ref: RitRef): string {
  const q = new URLSearchParams();
  if (ref.trip) q.set("trip", ref.trip);
  if (ref.datum) q.set("datum", ref.datum);
  if (ref.voertuig) q.set("voertuig", ref.voertuig);
  if (ref.instap_halte) q.set("instap_halte", ref.instap_halte);
  if (ref.instap_naam) q.set("instap_naam", ref.instap_naam);
  if (ref.instap_ms) q.set("instap_ms", String(Math.round(ref.instap_ms)));
  if (ref.richting) q.set("richting", ref.richting);
  return q.toString();
}

export const api = {
  feedback: (payload: FeedbackInzending) => verstuurFeedback(payload),
  dichtbij: (lat: number, lon: number, straal: number, offset = 0) =>
    get<Dichtbij>(dichtbijPad(lat, lon, straal, offset)),
  // Vertrek[].kleur/tekstkleur uit GTFS; oude Live-antwoorden hebben lijn_kleur/lijn_tekstkleur.
  halte: (id: string, modus: Filter = "alles", max = 30) =>
    get<Halte>(`/halte/${encodeURIComponent(id)}?modus=${modus}&max=${max}`),
  // Stationsbord: alle GTFS-quays binnen 350m, chronologisch + nacht-fallback.
  // fetch gebruikt altijd no-store en een unieke _fresh-parameter.
  stationVertrektijden: (id: string, max = 60) =>
    get<StationVertrektijden>(
      `/vertrektijden?halte_id=${encodeURIComponent(id)}&max=${max}`,
      12000,
      API_V2_BASE
    ),
  // Alleen na het kiezen van een lijn: alle resterende ritten van vandaag,
  // niet beperkt tot het gewone vertrekbord van 60-120 minuten.
  lijnVertrekken: (id: string, lijn: string, modus: string, cluster: boolean) =>
    get<LijnVertrekken>(
      `/lijnvertrekken?halte_id=${encodeURIComponent(id)}&line=${encodeURIComponent(lijn)}&modus=${encodeURIComponent(modus)}&cluster=${cluster ? "1" : "0"}`,
      12000,
      API_V2_BASE
    ),
  rit: (ref: RitRef) => get<Rit>(`/rit?${ritParams(ref)}`),
  // Exacte GTFS-rit + dienstdatum; de API weigert onzekere voertuigkoppelingen.
  liveRitVoertuig: (ritId: string, datum: string) =>
    get<LiveRitVoertuigAntwoord>(
      `/voertuig?rit_id=${encodeURIComponent(ritId)}&datum=${encodeURIComponent(datum)}`,
      4500,
      API_V2_BASE
    ),
  storingen: (ids: string[]) => get<StoringenAntwoord>(`/storingen?haltes=${ids.map(encodeURIComponent).join(",")}`),
  // &lijnen=1 levert de optionele GTFS-kleuren (kleur/tekstkleur) mee met elke lijn.
  zoek: (q: string) => get<Zoek>(`/zoek?q=${encodeURIComponent(q)}&lijnen=1`, 8000)
};
