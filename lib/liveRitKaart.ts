import type { LiveRitPositie, LiveRitVoertuigAntwoord } from "./types";

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
