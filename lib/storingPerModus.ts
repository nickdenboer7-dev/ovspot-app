import type { Modus, Storing, Vertrek, ZoekLijn } from "./types";

const MODI = ["train", "metro", "tram", "bus", "ferry"];
const WOORD_MODUS: Record<string, Modus> = {
  trein: "train", metro: "metro", tram: "tram", bus: "bus",
  veerboot: "ferry", veer: "ferry"
};

function regelModus(tekst: string): Modus | null {
  const match = tekst.trim().match(/^(?:omleiding[:\s-]+)?(trein|metro|tram|bus|veerboot|veer)\b/i);
  return match ? WOORD_MODUS[match[1].toLowerCase()] : null;
}

function lijnId(lijn: string): string {
  return String(lijn || "").trim().toUpperCase().replace(/\s+/g, " ");
}

/** Toon op een haltebord alleen storingen voor de gekozen vervoerssoort.
 * De GTFS-modus uit de API heeft voorrang, daarna herkenbare tekst en de
 * echte lijncatalogus. Ongeclassificeerde algemene meldingen blijven zichtbaar.
 */
export function storingPastBijModus(
  storing: Storing,
  actieveModus: string,
  catalogus: Pick<ZoekLijn, "lijn" | "modus">[] = [],
  vertrekken: Pick<Vertrek, "lijn" | "modus">[] = []
): boolean {
  if (actieveModus === "alles") return true;

  const expliciet = [...new Set([
    ...(Array.isArray(storing.modi) ? storing.modi : []),
    ...(storing.modus ? [storing.modus] : [])
  ])].filter(m => MODI.includes(m));
  if (expliciet.length) return expliciet.includes(actieveModus);

  // Bij 'Bus N89...' kan het nachtnummer ontbreken in de huidige vertrekken.
  const prefix = regelModus(storing.titel);
  if (prefix) return prefix === actieveModus;

  const namen = new Set((storing.lijnen || []).map(lijnId).filter(Boolean));
  if (namen.size) {
    const bekendeModi = [...new Set([...catalogus, ...vertrekken]
      .filter(l => namen.has(lijnId(l.lijn))).map(l => l.modus))];
    if (bekendeModi.length) return bekendeModi.includes(actieveModus);
    // Nachtritten hoeven niet in het actuele vertrekvenster te staan.
    if ([...namen].every(l => /^N\d{1,4}[A-Z]?$/.test(l))) return actieveModus === "bus";
  }

  // Een algemene/onbekende storing nooit stilzwijgend verbergen.
  return true;
}
