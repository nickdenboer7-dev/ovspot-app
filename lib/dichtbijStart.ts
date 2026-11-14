/**
 * Snelle start van Dichtbij: begin met de laatst bekende positie en lijst terwijl de GPS nog zoekt.
 * Alleen pure functies, zodat ze zonder telefoon te testen zijn.
 */
export const START_POSITIE_MAX_MS = 30 * 60_000;
export const START_LIJST_MAX_MS = 5 * 60_000;
/** Kleinere verplaatsingen laden de lijst niet opnieuw (GPS-ruis, een paar passen). */
export const ANKER_DREMPEL_M = 100;
/** Een eerdere lijst mag alleen als tussenstand dienen als hij van vlakbij komt. */
export const OUD_TONEN_MAX_M = 500;
/** Zo kort geleden opgehaald dat de live-aanduiding nog klopt (kleiner dan anderhalf keer het ververstempo). */
export const OUD_NOG_LIVE_MS = 30_000;

type Punt = { lat: number; lon: number };

export function meters(a: Punt, b: Punt): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

const geldigPunt = (p: any): p is Punt =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

/** Het anker bepaalt welke lijst geladen is; het verschuift pas na `drempel` meter of bij een andere bron. */
export function kiesAnker<T extends Punt & { bron: string }>(anker: T | null, pos: T | null, drempel = ANKER_DREMPEL_M): T | null {
  if (!pos) return null;
  if (!anker || anker.bron !== pos.bron || meters(anker, pos) > drempel) return pos;
  return anker;
}

const versGenoeg = (t: unknown, nu: number, maxMs: number): t is number =>
  typeof t === "number" && Number.isFinite(t) && nu - t <= maxMs && t - nu <= 60_000;

export function leesBewaardePositie(raw: string | null, nu: number, maxMs = START_POSITIE_MAX_MS): Punt | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return geldigPunt(o) && versGenoeg(o.t, nu, maxMs) ? { lat: o.lat, lon: o.lon } : null;
  } catch { return null; }
}

export type BewaardeLijst<D> = { key: string; data: D; ts: number; lat: number; lon: number; straal: number };

export function leesBewaardeLijst<D extends { haltes: unknown[] }>(raw: string | null, nu: number, maxMs = START_LIJST_MAX_MS): BewaardeLijst<D> | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!geldigPunt(o) || !versGenoeg(o.ts, nu, maxMs) || typeof o.key !== "string"
      || !Number.isFinite(o.straal) || !o.data || !Array.isArray(o.data.haltes)) return null;
    return { key: o.key, data: o.data, ts: o.ts, lat: o.lat, lon: o.lon, straal: o.straal };
  } catch { return null; }
}

/** Mag de eerdere lijst getoond worden tot de verse binnen is? Zelfde afstand-instelling, recent en van vlakbij. */
export function magOudeLijstTonen(oud: BewaardeLijst<unknown> | null, anker: Punt | null, straal: number, key: string, nu: number): boolean {
  if (!oud || !anker || oud.straal !== straal || !versGenoeg(oud.ts, nu, START_LIJST_MAX_MS)) return false;
  return oud.key === key || meters(oud, anker) <= OUD_TONEN_MAX_M;
}
