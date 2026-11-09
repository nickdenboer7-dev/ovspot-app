import type { LiveRitPositie, Rit, RitHalte, RitKaartHalte } from "./types";

export const RITV2 = {
  navy: "#0A3A7A", blue: "#0B57D0", info: "#E8F0FE",
  pale: "#DCE8FB", muted: "#5F6B7A", pastLine: "#C5CCD6",
  pastDot: "#AEB8C6", delay: "#B34700", green: "#1B6B33",
  greenDot: "#1B8A3C", early: "#8A3E91",
  gpsBg: "#E3F3E7", staleBg: "#E7EBF0",
  strip: "#F3F5F8", ink: "#182332"
} as const;

export type RitV2Stop = {
  index: number; h: RitHalte; naam: string; plaats: string;
  toonPlaats: boolean; verwacht: string; gepland: string;
  verwachtMs: number | null; vertragingSec: number; vertragingMin: number;
  gepasseerd: boolean;
};

/** NL-plaats staat al in h.plaats; haal alleen het redundante letterlijke
 * 'Amsterdam, ' weg, nooit delen van de officiële halteomschrijving.
 */
export function compacteHalteNaam(naam: string, plaats: string): string {
  const n = String(naam || "").trim();
  const city = String(plaats || "").trim();
  if (city && n.slice(0, city.length + 2).toLowerCase() === (city + ", ").toLowerCase()) {
    return n.slice(city.length + 2);
  }
  return n;
}

/** Hele seconds from the unrounded epoch timestamp and the planned NL clock.
 * When a server sends only minute-resolution data, retain that honest precision.
 * Never use the user's device timezone to interpret Netherlands trip times.
 */
const NL_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit",
  second: "2-digit", hourCycle: "h23"
});

function minuutVanKlok(klok: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(klok);
  if (!m) return null;
  const uur = Number(m[1]), minuut = Number(m[2]);
  return uur >= 0 && uur < 30 && minuut < 60 ? uur * 60 + minuut : null;
}

function deltaSeconden(gepland: string, verwachtMs: number | null): number | null {
  const planned = minuutVanKlok(gepland);
  if (planned == null || verwachtMs == null || !Number.isFinite(verwachtMs) ||
      verwachtMs < 1e12) return null;
  const parts = NL_TIME.formatToParts(new Date(verwachtMs));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const hour = get("hour"), minute = get("minute"), second = get("second");
  if (![hour, minute, second].every(Number.isFinite)) return null;
  let delta = (hour * 60 + minute - planned) * 60 +
    second + ((verwachtMs % 1000) / 1000);
  // Relative to the local GTFS clock, 23:59 -> 00:01 is +2 minutes.
  while (delta > 12 * 3600) delta -= 86400;
  while (delta < -12 * 3600) delta += 86400;
  return Math.round(delta);
}

function klokVanTimestamp(ms: number): string {
  const parts = NL_TIME.formatToParts(new Date(ms));
  const val = (k: string) => parts.find(p => p.type === k)?.value ?? "00";
  return val("hour").padStart(2, "0") + ":" + val("minute").padStart(2, "0");
}

export function rondAfwijkingMinuten(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  const rounded = Math.round(Math.abs(seconds) / 60);
  return rounded === 0 ? 0 : Math.sign(seconds) * rounded;
}

export function afwijkingTekst(minuten: number): string {
  return minuten > 0 ? "+" + minuten + " min"
    : minuten < 0 ? Math.abs(minuten) + " min te vroeg" : "Op tijd";
}

/** Round once for the stop countdown. 0 is handled as 'aankomend' in the row. */
export function verwachteAankomstMin(verwachtMs: number | null, nu: number): number | null {
  if (verwachtMs == null || !Number.isFinite(verwachtMs)) return null;
  return Math.max(0, Math.round((verwachtMs - nu) / 60_000));
}

export function volgendeHalteTekst(
  verwachtMs: number | null, nu: number,
  t: (tekst: string) => string = x => x
): string | null {
  const min = verwachteAankomstMin(verwachtMs, nu);
  if (min === null) return null;
  return t("Volgende halte") + " · " +
    (min === 0 ? t("aankomend") : t("over") + " " + min + " min");
}

/** Calculate visible upcoming stops from the *measured scroll viewport*;
 * reserve space for the passed stop and both expansion controls. At least
 * 6 upcoming stops (including next) remain accessible on small screens.
 */
export function zichtbaarKomendeHaltes(
  viewportDp: number, heeftVorige: boolean, heeftEerderKnop: boolean
): number {
  if (!Number.isFinite(viewportDp) || viewportDp <= 0) return 6;
  const reserved = 64 + (heeftVorige ? 48 : 0) +
    (heeftEerderKnop ? 44 : 0) + 44 + 8;
  return Math.max(6, 1 + Math.max(0, Math.floor((viewportDp - reserved) / 48)));
}

export function telKlokMinuten(klok: string, plus: number): string {
  const planned = minuutVanKlok(klok);
  if (planned == null) return klok;
  const dayMinutes = 24 * 60;
  const total = ((planned + plus) % dayMinutes + dayMinutes) % dayMinutes;
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" +
    String(total % 60).padStart(2, "0");
}

/** One time source per stop; seconds kept until a SINGLE rounding for display.
 * A subsequent explicit live update (including a zero recovery) resets carry.
 * Never double-add a server-propagated delay.
 */
export function bouwRitV2Haltes(rit: Rit, gpsLaatsteGepasseerd: number | null): RitV2Stop[] {
  let carrySec = 0;
  return rit.haltes.map((h, index) => {
    const gepland = String(h.gepland || "").trim();
    const bronMs = typeof h.tijd_ms === "number" && Number.isFinite(h.tijd_ms) &&
      h.tijd_ms > 1e12 ? h.tijd_ms : null;
    const explicit = h.live_tijd === true;
    const reported = h.verwacht && h.verwacht !== gepland;
    // Do not infer an independent update merely from the route-level delay.
    const serverPropagated = !explicit && !!reported &&
      Number.isFinite(h.vertraging_min) && h.vertraging_min !== 0;
    const source = explicit || serverPropagated;
    if (source) {
      carrySec = deltaSeconden(gepland, bronMs) ??
        ((minuutVanKlok(h.verwacht || "") !== null && minuutVanKlok(gepland) !== null)
          ? clockDeltaSec(h.verwacht, gepland)
          : Math.round((Number.isFinite(h.vertraging_min) ? h.vertraging_min : 0) * 60));
    }
    const seconds = h.vervalt ? 0 : carrySec;
    const vertragingMin = rondAfwijkingMinuten(seconds);
    const verwachtMs = h.vervalt ? bronMs :
      source ? bronMs : (bronMs == null ? null : bronMs + seconds * 1000);
    const verwacht = h.vervalt ? String(h.verwacht || gepland) :
      (minuutVanKlok(gepland) != null
        ? telKlokMinuten(gepland, vertragingMin)
        : (verwachtMs != null ? klokVanTimestamp(verwachtMs) : String(h.verwacht || "")));
    const gepasseerd = gpsLaatsteGepasseerd !== null
      ? index <= gpsLaatsteGepasseerd
      : h.state ? h.state === "PASSED" : h.status === "geweest";
    const vorige = rit.haltes[index - 1];
    const plaats = String(h.plaats || "").trim();
    return { index, h, naam: compacteHalteNaam(h.naam, plaats), plaats,
      toonPlaats: !!plaats && (index === 0 || plaats !== String(vorige?.plaats || "").trim()),
      verwacht, gepland, verwachtMs, vertragingSec: seconds, vertragingMin, gepasseerd };
  });
}

function clockDeltaSec(expected: string, planned: string): number {
  const e = minuutVanKlok(expected), p = minuutVanKlok(planned);
  if (e == null || p == null) return 0;
  let d = (e - p) * 60;
  if (d > 12 * 3600) d -= 86400;
  if (d < -12 * 3600) d += 86400;
  return d;
}

/** Fysieke ruimte in React Native dp tussen de twee haltecentra.
 * Met 28dp marker en 12dp haltecirkel blijft rondom >=4dp vrij.
 * De GPS bepaalt de gewenste positie; deze functie begrenst alleen de UI.
 */
export const VOERTUIG_DIAMETER = 28;
export const HALTE_DIAMETER = 12;
export const MIN_TUSSENRUIMTE_DP = 4;

export type VeiligeVoertuigPositie = {
  lengte: number; minCentrum: number; maxCentrum: number; normaal: number;
};

export function veiligeVoertuigPositie(
  progress: number, vorigeHoogte: number, huidigeHoogte: number
): VeiligeVoertuigPositie | null {
  const lengte = (vorigeHoogte + huidigeHoogte) / 2;
  const afstand = (VOERTUIG_DIAMETER + HALTE_DIAMETER) / 2 + MIN_TUSSENRUIMTE_DP;
  if (![progress, vorigeHoogte, huidigeHoogte, lengte].every(Number.isFinite) ||
      vorigeHoogte <= 0 || huidigeHoogte <= 0 || lengte < afstand * 2) {
    return null;
  }
  const minCentrum = afstand;
  const maxCentrum = lengte - afstand;
  const gpsCenter = Math.max(minCentrum, Math.min(maxCentrum,
    Math.max(0, Math.min(1, progress)) * lengte));
  const normaal = maxCentrum > minCentrum
    ? (gpsCenter - minCentrum) / (maxCentrum - minCentrum) : 0.5;
  return { lengte, minCentrum, maxCentrum, normaal };
}

export type GpsSegment = { vorigeIndex: number; volgendeIndex: number;
  fractie: number; afstandM: number };

/** Alleen een unieke match op de opeenvolgende GTFS-stopvolgorde.
 * Het echte GPS-punt bepaalt het segment EN de fractie: geen tijdinterpolatie.
 * Bij ontbrekende geometrie of ambigue lusrit geen voertuig tekenen.
 */
export function projecteerGpsOpRit(
  rit: Pick<Rit, "haltes" | "stops">, gps: Pick<LiveRitPositie, "lat" | "lon"> | null
): GpsSegment | null {
  if (!gps || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lon) ||
      gps.lat < 50.4 || gps.lat > 54.1 || gps.lon < 3 || gps.lon > 8 ||
      !Array.isArray(rit.stops) || rit.stops.length < 2) return null;
  const punten = koppelPunten(rit.haltes, rit.stops);
  const latFactor = 111_320;
  const lonFactor = 111_320 * Math.cos(gps.lat * Math.PI / 180);
  const candidates: GpsSegment[] = [];
  for (let i = 0; i + 1 < rit.haltes.length; i++) {
    const a = punten[i], b = punten[i + 1];
    if (!a || !b || rit.haltes[i].vervalt || rit.haltes[i + 1].vervalt) continue;
    const ax = (a.longitude - gps.lon) * lonFactor;
    const ay = (a.latitude - gps.lat) * latFactor;
    const bx = (b.longitude - gps.lon) * lonFactor;
    const by = (b.latitude - gps.lat) * latFactor;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    if (len2 < 25 || len2 > 30_000 * 30_000) continue;
    const raw = -(ax * dx + ay * dy) / len2;
    const fractie = Math.min(1, Math.max(0, raw));
    const afstandM = Math.hypot(ax + dx * fractie, ay + dy * fractie);
    if (afstandM <= 120 && raw > -0.25 && raw < 1.25) {
      candidates.push({ vorigeIndex: i, volgendeIndex: i + 1,
        fractie: Math.max(0.05, Math.min(0.90, fractie)), afstandM });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.afstandM - b.afstandM);
  // Zelfde geo-coördinaat kan bij lusritten in andere volgorde voorkomen.
  if (candidates[1] && Math.abs(candidates[0].vorigeIndex - candidates[1].vorigeIndex) > 1 &&
      candidates[1].afstandM - candidates[0].afstandM < 25) return null;
  return candidates[0];
}

function koppelPunten(haltes: RitHalte[], stops: RitKaartHalte[]) {
  const result: Array<RitKaartHalte | undefined> = Array(haltes.length).fill(undefined);
  let cursor = 0;
  for (let i = 0; i < haltes.length; i++) {
    const match = stops.findIndex((p, j) => j >= cursor && p?.stop_id === haltes[i].id);
    if (match < 0) continue;
    cursor = match + 1;
    const p = stops[match];
    if (p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) result[i] = p;
  }
  return result;
}

export function isGpsActueel(gps: Pick<LiveRitPositie,"timestamp"|"leeftijd_s"> | null,
  nuMs: number, fout = false): boolean {
  if (fout || !gps || !Number.isFinite(gps.timestamp) || !Number.isFinite(gps.leeftijd_s)) return false;
  const ageSec = Math.max(gps.leeftijd_s, (nuMs / 1000) - gps.timestamp);
  return ageSec >= -5 && ageSec <= 45;
}

/** Distinguish GPS age from missing vehicle data and missing route geometry.
 * A new request error does not invalidate an earlier fix until it actually ages out.
 */
export function ritGpsStatus(
  gps: Pick<LiveRitPositie, "timestamp" | "leeftijd_s"> | null,
  nuMs: number,
  heeftSegment: boolean,
  opts: { trein?: boolean; enabled?: boolean; laden?: boolean } = {}
): string {
  if (opts.trein) return "Geen voertuig-GPS";
  if (opts.enabled === false) return "GPS uitgeschakeld";
  if (gps) {
    if (!isGpsActueel(gps, nuMs)) return "GPS verouderd";
    return heeftSegment ? "GPS actueel" : "GPS niet op route";
  }
  return opts.laden ? "GPS ophalen…" : "Geen voertuig-GPS";
}
