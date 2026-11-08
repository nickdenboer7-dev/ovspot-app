/** Kleuren overgenomen van de actieve OVspot-kaart (21 okt 2026).
 * Bron: static/.../v81-marker-carrier-colors-20261021-r1.js.
 * GVB-metrolijnkleuren: huidige routes.route_color in GTFS; geen netwerk-call.
 */
import type { Modus } from "../lib/types";

export type WayfindingColor = { bg: string; fg: string; soft: string };
const PRIMARY = "#185c98";
const PRIMARY_SOFT = "#e8f0f8";
const DEFAULT: WayfindingColor = { bg: "#16865f", fg: "#ffffff", soft: "#e6f4ed" };

const COLORS: Record<string, WayfindingColor> = {
  NS: { bg: "#ffc917", fg: "#003082", soft: "#fff6cb" },
  NSINTERNATIONAL: { bg: "#003082", fg: "#ffffff", soft: "#e5edf7" },
  GVB: { bg: "#0863b5", fg: "#ffffff", soft: "#e7f1fb" },
  RET: { bg: "#d82331", fg: "#ffffff", soft: "#ffebed" },
  HTM: { bg: "#cb3b2c", fg: "#ffffff", soft: "#fff0ed" },
  EBS: { bg: "#0ec5ff", fg: "#111111", soft: "#e5faff" },
  ARRIVA: { bg: "#00becd", fg: "#2d146e", soft: "#e5f9fb" },
  KEOLIS: { bg: "#00a9c1", fg: "#111111", soft: "#e2f8fb" },
  CONNEXXION: { bg: "#d1ea32", fg: "#006772", soft: "#f4facd" },
  QBUZZ: { bg: "#ff9622", fg: "#111111", soft: "#fff1e1" },
  RRREIS: { bg: "#4f287b", fg: "#ffffff", soft: "#eee8f6" },
  BLAUWNET: { bg: "#069edb", fg: "#111111", soft: "#e4f6fd" },
  TESO: { bg: "#ffd700", fg: "#222222", soft: "#fff8d3" },
  DOEKsen: { bg: "#043176", fg: "#ffffff", soft: "#e5eaf4" },
  DB: { bg: "#ec0016", fg: "#ffffff", soft: "#ffebed" },
  VIAS: { bg: "#1f307e", fg: "#ffffff", soft: "#e9ecf7" },
  NIGHTJET: { bg: "#111b42", fg: "#ffffff", soft: "#e7e8ef" },
  EUROPEANSLEEPER: { bg: "#40002c", fg: "#ffffff", soft: "#f6e8f1" },
  GOVOLTA: { bg: "#0c7bfe", fg: "#111111", soft: "#e8f2ff" },
  EUROSTAR: { bg: "#00286a", fg: "#fcf5d8", soft: "#e5edfb" },
  NMBS: { bg: "#0072bb", fg: "#ffffff", soft: "#e5f1fc" }
};

// Live GTFS route_color (GVB metro), zie bestaande OVspot-kaart.
const GVB_METRO: Record<string, WayfindingColor> = {
  "50": { bg: "#187a36", fg: "#ffffff", soft: "#e8f5ea" },
  "51": { bg: "#ff6600", fg: "#000000", soft: "#fff1e8" },
  "52": { bg: "#00adef", fg: "#000000", soft: "#e6f8ff" },
  "53": { bg: "#d81118", fg: "#ffffff", soft: "#fdebed" },
  "54": { bg: "#fff200", fg: "#000000", soft: "#fffde4" }
};

export function carrierKey(raw?: string): string {
  const k = String(raw || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["CXX", "TRANSDEV", "CONNEXXION"].includes(k)) return "CONNEXXION";
  if (["ARR", "ARRIVA"].includes(k)) return "ARRIVA";
  if (["NEDERLANDSESPOORWEGEN", "NS"].includes(k)) return "NS";
  if (["IFFNS", "IFFNSINT", "NSINT", "NSINTERNATIONAL"].includes(k)) return "NSINTERNATIONAL";
  if (["DOEKSEN", "REDERIJDOEKSEN"].includes(k)) return "DOEKsen";
  if (["RRREIS", "RRRREIS"].includes(k)) return "RRREIS";
  if (["BLAUWNET", "RRREISBLAUWNET"].includes(k)) return "BLAUWNET";
  return k;
}

/** GTFS levert RRGGBB zonder #; accepteer ook veilige #RRGGBB-antwoorden. */
function gtfsHex(raw?: string): string | null {
  const hex = String(raw || "").trim().replace(/^#/, "").toUpperCase();
  return /^[0-9A-F]{6}$/.test(hex) ? `#${hex}` : null;
}

/** Houd de tekst leesbaar bij een GTFS-achtergrond zonder geldige tekstkleur. */
function contrastKleur(bg: string): string {
  const rgb = [1, 3, 5].map(i => parseInt(bg.slice(i, i + 2), 16) / 255);
  const lum = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return (0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2]) > 0.179 ? "#000000" : "#FFFFFF";
}

export function lijnKleur(lijn: string, modus: Modus, vervoerder?: string, kleur?: string, tekstkleur?: string): WayfindingColor {
  const key = carrierKey(vervoerder);
  let fallback: WayfindingColor;
  if (modus === "metro" && key === "GVB" && GVB_METRO[lijn]) fallback = GVB_METRO[lijn];
  else if (modus === "train") fallback = COLORS[key] || COLORS.NS;
  else if (modus === "tram") fallback = COLORS[key] && key !== "GVB"
    ? COLORS[key] : { bg: "#cb3b2c", fg: "#ffffff", soft: "#fff0ed" };
  else if (modus === "ferry") fallback = COLORS[key] || { bg: "#0b878a", fg: "#ffffff", soft: "#e4f5f5" };
  else fallback = COLORS[key] || (modus === "metro" ? COLORS.GVB : DEFAULT);
  const bg = gtfsHex(kleur);
  const fg = gtfsHex(tekstkleur);
  if (!bg && !fg) return fallback;
  return { ...fallback, bg: bg || fallback.bg, fg: fg || (bg ? contrastKleur(bg) : fallback.fg) };
}

/** Witte lijnbadges blijven zichtbaar op een wit zoekresultaat. */
export function lijnBadgeHeeftRand(palet: WayfindingColor): boolean {
  return palet.bg.toUpperCase() === "#FFFFFF";
}

/** Consistente achtergrond per vervoerssoort voor zoek-iconen.
 * Voertuiglabels en lijnbadges behouden hun eigen GTFS-routekleuren.
 */
export function modusIcoonKleur(modus: Modus | null): WayfindingColor {
  switch (modus) {
    case "train": return COLORS.NS; // NS-geel met donkerblauw pictogram
    case "metro": return COLORS.GVB;
    case "tram": return { bg: "#cb3b2c", fg: "#ffffff", soft: "#fff0ed" };
    case "bus": return DEFAULT;
    case "ferry": return { bg: "#0b878a", fg: "#ffffff", soft: "#e4f5f5" };
    default: return { bg: PRIMARY, fg: "#ffffff", soft: PRIMARY_SOFT };
  }
}

export function halteKleur(modi: Modus[], vervoerder?: string): WayfindingColor {
  if (modi.includes("train")) return COLORS.NS;
  if (modi.includes("metro") && (modi.includes("tram") || modi.includes("ferry"))) return COLORS.GVB;
  if (modi.includes("tram") && !modi.includes("bus")) return { bg: "#cb3b2c", fg: "#ffffff", soft: "#fff0ed" };
  if (modi.includes("ferry") && !modi.includes("bus")) return { bg: "#0b878a", fg: "#ffffff", soft: "#e4f5f5" };
  if (modi.includes("metro")) return COLORS.GVB;
  return COLORS[carrierKey(vervoerder)] || DEFAULT;
}

export function halteIcoon(modi: Modus[]): "train-outline" | "swap-horizontal" | "subway-outline" | "bus-outline" | "boat-outline" {
  if (modi.includes("train")) return "train-outline";
  if (modi.includes("metro") && (modi.includes("tram") || modi.includes("bus"))) return "swap-horizontal";
  if (modi.includes("metro")) return "subway-outline";
  if (modi.includes("ferry") && !modi.includes("bus")) return "boat-outline";
  return "bus-outline";
}

export const wayfindingBlue = PRIMARY;
export const wayfindingBlueSoft = PRIMARY_SOFT;
