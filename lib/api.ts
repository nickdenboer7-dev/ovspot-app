import Constants from "expo-constants";
import type { Dichtbij, Filter, Halte, Rit, RitRef, StoringenAntwoord, Zoek } from "./types";
import { freshApiUrl } from "./freshRequest";

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBase?: string };
export const API_BASE = (extra.apiBase || "https://ovspot.nl/app/v1").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Geen eigen ETag-cache: elk vertrek-/rit-/zoekverzoek wordt opnieuw via HTTPS opgehaald.
async function get<T>(path: string, timeoutMs = 12000): Promise<T> {
  const url = freshApiUrl(API_BASE, path);
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
  dichtbij: (lat: number, lon: number, straal: number) =>
    get<Dichtbij>(`/dichtbij?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&straal=${Math.round(straal)}&max=8`),
  halte: (id: string, modus: Filter = "alles", max = 30) =>
    get<Halte>(`/halte/${encodeURIComponent(id)}?modus=${modus}&max=${max}`),
  rit: (ref: RitRef) => get<Rit>(`/rit?${ritParams(ref)}`),
  storingen: (ids: string[]) => get<StoringenAntwoord>(`/storingen?haltes=${ids.map(encodeURIComponent).join(",")}`),
  // &lijnen=1 levert de optionele GTFS-kleuren (kleur/tekstkleur) mee met elke lijn.
  zoek: (q: string) => get<Zoek>(`/zoek?q=${encodeURIComponent(q)}&lijnen=1`, 8000)
};
