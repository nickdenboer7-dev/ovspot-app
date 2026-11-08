import Constants from "expo-constants";
import type { Dichtbij, Filter, Halte, Rit, RitRef, LiveRitVoertuigAntwoord, StoringenAntwoord, Zoek, StationVertrektijden } from "./types";
import { freshApiUrl } from "./freshRequest";
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

// Geen eigen ETag-cache: elk vertrek-/rit-/zoekverzoek wordt opnieuw via HTTPS opgehaald.
async function get<T>(path: string, timeoutMs = 12000, base = API_BASE): Promise<T> {
  const url = freshApiUrl(base, path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-store, no-cache, max-age=0",
        Pragma: "no-cache"
      },
      cache: "no-store",
      signal: controller.signal
    });
  } catch {
    throw new ApiError("Geen verbinding", 0);
  } finally {
    clearTimeout(timer);
  }
  // Zonder If-None-Match mag de server geen 304 zonder body leveren.
  if (res.status === 304) throw new ApiError("Geen nieuw API-antwoord ontvangen", 304);
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body) {
    throw new ApiError(body?.fout || (res.status >= 500 ? "Gegevens tijdelijk niet beschikbaar" : "Er ging iets mis"), res.status);
  }
  return body as T;
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
