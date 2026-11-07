import type { Modus, Rit, ZoekResultaat } from "./types";

export type CatalogLijn = { lijn: string; modus: Modus; vervoerder: string };

function norm(v: string): string {
  return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Exacte haltes en groepen met dezelfde haltenaam boven losse gedeeltelijke treffers. */
export function rangschikZoekresultaten(items: ZoekResultaat[], query: string): ZoekResultaat[] {
  const q = norm(query);
  if (!q || items.length < 2) return items;
  const counts = new Map<string, number>();
  for (const x of items) {
    const name = norm(x.naam);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const naamScore = (x: ZoekResultaat) => {
    const name = norm(x.naam), place = norm(x.plaats);
    if (name === q || [name, place].filter(Boolean).join(" ") === q) return 0;
    if (name.startsWith(q) || name.endsWith(" " + q)) return 1;
    if (name.includes(q) || place.startsWith(q)) return 2;
    return 3;
  };
  return items.map((item, i) => ({ item, i }))
    .sort((a, b) => naamScore(a.item) - naamScore(b.item)
      || (counts.get(norm(b.item.naam)) || 0) - (counts.get(norm(a.item.naam)) || 0)
      || a.i - b.i)
    .map((v) => v.item);
}

export function geldigeLijnen(input: unknown, max=12): CatalogLijn[] {
  if (!Array.isArray(input)) return [];
  const out: CatalogLijn[] = [], seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const x = raw as Record<string, unknown>;
    if (typeof x.lijn !== "string" || !x.lijn || x.lijn.length > 30
      || typeof x.modus !== "string" || typeof x.vervoerder !== "string") continue;
    const key = [x.lijn,x.modus,x.vervoerder].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({lijn:x.lijn,modus:x.modus,vervoerder:x.vervoerder});
    if (out.length >= max) break;
  }
  return out;
}

export function positieBevestigd(rit: Partial<Pick<Rit, "positie_betrouwbaar" | "live_positie" | "nu_hier">>): boolean {
  return (rit.live_positie === true || rit.positie_betrouwbaar === true) && !!rit.nu_hier;
}

export function positieTekst(rit: Partial<Pick<Rit, "positie_betrouwbaar" | "live_positie" | "nu_hier" | "rit_status">>): string {
  if (!rit.nu_hier) return "";
  const bevestigd = positieBevestigd(rit);
  if (!bevestigd) return "Verwachte positie";
  // Alleen een bevestigde rit met de nieuwe API-status krijgt het specifiekere label.
  // Oude API-antwoorden behouden het vertrouwde "Nu hier".
  return rit.rit_status === "ARRIVED" ? "Halteert nu" : "Nu hier";
}
