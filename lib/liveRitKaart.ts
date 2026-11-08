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
export const LIVE_MAP_SNAP_DISTANCE_M = 180;
export const LIVE_MAP_SNAP_GAP_MS = 15_000;

export type VorigeLiveKaartFix = Pick<LiveRitPositie, "lat" | "lon" | "timestamp"> & {
  ontvangenMs: number;
};

/** Geografische afstand tussen twee KV6-posities; geen schermpixel-schatting. */
export function gpsAfstandMeter(
  a: Pick<LiveRitPositie, "lat" | "lon">,
  b: Pick<LiveRitPositie, "lat" | "lon">
): number {
  const rad = Math.PI / 180;
  const latDelta = (b.lat - a.lat) * rad;
  const lonDelta = (b.lon - a.lon) * rad;
  const hav = Math.sin(latDelta / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(lonDelta / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, hav))));
}

/** Snappen na pauze, bij een gemiste update of bij een grote positieversprong. */
export function moetVoertuigSnappen(
  vorige: VorigeLiveKaartFix | null,
  volgende: Pick<LiveRitPositie, "lat" | "lon" | "timestamp">,
  ontvangenMs: number,
  skipAnimation = false
): boolean {
  if (skipAnimation || !vorige) return true;
  if (!Number.isFinite(volgende.lat) || !Number.isFinite(volgende.lon)
    || !Number.isFinite(vorige.lat) || !Number.isFinite(vorige.lon)) return true;
  const tussenMs = ontvangenMs - vorige.ontvangenMs;
  const bronGapMs = (volgende.timestamp - vorige.timestamp) * 1000;
  return !Number.isFinite(tussenMs) || tussenMs < 0
    || tussenMs > LIVE_MAP_SNAP_GAP_MS
    || !Number.isFinite(bronGapMs) || bronGapMs < 0
    || bronGapMs > LIVE_MAP_SNAP_GAP_MS
    || gpsAfstandMeter(vorige, volgende) > LIVE_MAP_SNAP_DISTANCE_M;
}

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
