import type { LiveRitPositie, LiveRitVoertuigAntwoord, RitHalte, RitKaartHalte, RitKaartPunt } from "./types";

export function geldigeKaartPunten(points: RitKaartPunt[] | undefined): RitKaartPunt[] {
  if (!Array.isArray(points)) return [];
  return points.filter(p => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
    && p.latitude >= -90 && p.latitude <= 90 && p.longitude >= -180 && p.longitude <= 180);
}

/** Alleen exacte GTFS route_color gebruiken; anders een rustige donkerblauwe lijn. */
export function ritRouteKleur(raw: string | undefined): string {
  return raw && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : "#1E3A8A";
}

/** Match op (stop_id, volgorde); een lusrit kan dezelfde halte tweemaal aandoen. */
export function markeerRitHaltes(stops: RitKaartHalte[] | undefined, haltes: RitHalte[]): RitKaartHalte[] {
  if (!Array.isArray(stops)) return [];
  let cursor = 0;
  const out: RitKaartHalte[] = [];
  for (const stop of stops) {
    if (!stop || !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)
      || stop.latitude < -90 || stop.latitude > 90 || stop.longitude < -180 || stop.longitude > 180) continue;
    let match = -1;
    for (let i = cursor; i < haltes.length; i++) {
      if (haltes[i].id === stop.stop_id) { match = i; break; }
    }
    if (match !== -1) cursor = match + 1;
    out.push({ ...stop, gepasseerd: match !== -1 && haltes[match].status === "geweest" });
  }
  return out;
}

export const LIVE_MAP_POLL_MS = 5000;
export const LIVE_MAP_ANIMATION_MS = 4000;
export const LIVE_MAP_MAX_AGE_S = 180;

export function geldigeRitPositie(
  antwoord: LiveRitVoertuigAntwoord,
  ritId: string,
  datum: string
): LiveRitPositie | null {
  const v = antwoord.voertuig;
  if (!antwoord.ok || !antwoord.beschikbaar || !v
      || antwoord.rit_id !== ritId || antwoord.datum !== datum
      || !Number.isFinite(v.lat) || !Number.isFinite(v.lon)
      || v.lat < 50.4 || v.lat > 54.1 || v.lon < 3 || v.lon > 8
      || !Number.isFinite(v.timestamp) || !Number.isFinite(v.leeftijd_s)
      || v.leeftijd_s < 0 || v.leeftijd_s > LIVE_MAP_MAX_AGE_S
      || !/^[A-Z0-9_-]{1,24}_[A-Za-z0-9_.-]{1,40}$/.test(v.voertuignummer)) {
    return null;
  }
  return { ...v, richting: v.richting != null && Number.isFinite(v.richting)
    ? Math.round(((((v.richting % 360) + 360) % 360) * 10)) / 10 : null };
}

export function wereldPixels(lat: number, lon: number, zoom = 14) {
  const safeLat = Math.max(-85.051128, Math.min(85.051128, lat));
  const radians = safeLat * Math.PI / 180;
  const total = 256 * Math.pow(2, zoom);
  return {
    x: (lon + 180) / 360 * total,
    y: (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * total
  };
}
