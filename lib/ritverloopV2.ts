import type { LiveRitPositie, Rit, RitHalte, RitKaartHalte } from "./types";

export const RITV2 = {
  navy: "#0A3A7A", blue: "#0B57D0", info: "#E8F0FE",
  pale: "#DCE8FB", muted: "#5F6B7A", pastLine: "#C5CCD6",
  pastDot: "#AEB8C6", delay: "#B34700", green: "#1B6B33",
  greenDot: "#1B8A3C", gpsBg: "#E3F3E7", staleBg: "#E7EBF0",
  strip: "#F3F5F8", ink: "#182332"
} as const;

export type RitV2Stop = {
  index: number; h: RitHalte; naam: string; plaats: string;
  toonPlaats: boolean; verwacht: string; gepland: string;
  verwachtMs: number | null; vertragingMin: number;
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

/** Een ontbrekende losse live-update neemt de recentste waargenomen vertraging
 * over totdat een volgende eigen live-update die corrigeert (inclusief 0).
 * Dit is een UI-veiligheidsnet voor de huidige v2.0.24 response, geen server-cache.
 */
export function bouwRitV2Haltes(rit: Rit, gpsLaatsteGepasseerd: number | null): RitV2Stop[] {
  let doorlopend = 0;
  return rit.haltes.map((h, index) => {
    const gepland = String(h.gepland || "").trim();
    const expliciet = h.live_tijd === true && Number.isFinite(h.vertraging_min);
    // Een toekomstige API met echte server-propagatie levert ook voor haltes
    // zonder eigen KV8-update al een afwijkende verwachte tijd + delta.
    // In dat geval mag de UI de vertraging niet nogmaals optellen.
    const serverDoorgelopen = !expliciet && h.vertraging_min > 0 &&
      !!h.verwacht && h.verwacht !== gepland;
    if (expliciet || serverDoorgelopen) doorlopend = Math.max(0, Math.round(h.vertraging_min));
    const vertragingMin = h.vervalt ? 0 : doorlopend;
    const verwacht = h.vervalt ? String(h.verwacht || gepland) :
      (expliciet || serverDoorgelopen) && h.verwacht
        ? h.verwacht : telKlokMinuten(gepland, vertragingMin);
    const bronMs = typeof h.tijd_ms === "number" && Number.isFinite(h.tijd_ms)
      ? h.tijd_ms : null;
    const verwachtMs = bronMs == null ? null
      : bronMs + (!expliciet && !serverDoorgelopen && !h.vervalt ? doorlopend * 60_000 : 0);
    const gepasseerd = gpsLaatsteGepasseerd !== null
      ? index <= gpsLaatsteGepasseerd
      : h.state ? h.state === "PASSED" : h.status === "geweest";
    const vorige = rit.haltes[index - 1];
    const plaats = String(h.plaats || "").trim();
    return { index, h, naam: compacteHalteNaam(h.naam, plaats), plaats,
      toonPlaats: !!plaats && (index === 0 || plaats !== String(vorige?.plaats || "").trim()),
      verwacht, gepland, verwachtMs, vertragingMin, gepasseerd };
  });
}

export function telKlokMinuten(klok: string, plus: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(klok);
  if (!m) return klok;
  const uren = Number(m[1]);
  const minuten = Number(m[2]);
  const totaal = (uren * 60 + minuten + Math.max(0, plus)) % 1440;
  return String(Math.floor(totaal / 60)).padStart(2, "0") + ":" +
    String(totaal % 60).padStart(2, "0");
}

export function verwachteAankomstMin(verwachtMs: number | null, nu: number): number | null {
  if (verwachtMs == null || !Number.isFinite(verwachtMs)) return null;
  return Math.max(0, Math.ceil((verwachtMs - nu) / 60_000));
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
