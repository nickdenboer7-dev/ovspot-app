import type { Rit, ZoekLijn, ZoekResultaat } from "./types";

export type CatalogLijn = ZoekLijn;

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

export function geldigeLijnen(input: unknown, max=40): CatalogLijn[] {
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
    out.push({
      lijn: x.lijn, modus: x.modus, vervoerder: x.vervoerder,
      ...(typeof x.kleur === "string" ? { kleur: x.kleur } : {}),
      ...(typeof x.tekstkleur === "string" ? { tekstkleur: x.tekstkleur } : {})
    });
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
  // KV8 geeft een haltebericht, niet automatisch de actuele GPS-positie.
  if (!bevestigd) return rit.rit_status === "ARRIVED" ? "Bij halte gemeld (KV8)" : "Volgende halte (KV8)";
  // Alleen een bevestigde rit met de nieuwe API-status krijgt het specifiekere label.
  // Oude API-antwoorden behouden het vertrouwde "Nu hier".
  return rit.rit_status === "ARRIVED" ? "Halteert nu" : "Nu hier";
}

/** Houd betrouwbare GPS, realtime KV8 en dienstregeling expliciet gescheiden. */
type RitLiveStatus = Partial<Pick<Rit,
  "live" | "vervallen" | "rit_status" | "status_omschrijving" | "nu_hier" |
  "positie_betrouwbaar" | "live_positie" | "gps_leeftijd_s" |
  "voertuig" | "voertuig_info">>;

export function ritBannerTitel(rit: RitLiveStatus): string {
  if (rit.vervallen) return "Deze rit vervalt";
  if (rit.rit_status === "INCOMING") return rit.status_omschrijving || "Onderweg naar beginhalte";
  if (!rit.live) return "Dienstregeling";
  // Rijdt nu/Bij halte uitsluitend bij bevestigde GPS, niet alleen KV8-passages.
  if (!positieBevestigd(rit)) return "Live tijden";
  if (rit.rit_status === "ARRIVED") return "Bij halte";
  if (rit.rit_status === "DRIVING") return "Rijdt nu";
  return "Live tijden";
}

/** Rustige GPS-versheid: geen secondenteller bij normale NDOV-intervallen. */
export function gpsVersheidLabel(leeftijd: number | null | undefined): string {
  if (typeof leeftijd !== "number" || !Number.isFinite(leeftijd) || leeftijd < 0) return "Positie geschat";
  if (leeftijd <= 45) return "GPS actueel";
  if (leeftijd <= 120) return "Live bijgewerkt";
  return "Positie geschat";
}

/** KV8-zonder-GPS blijft als KV8 benoemd; alleen echte voertuig-GPS heeft GPS-versheid. */
export function ritBronLabel(rit: RitLiveStatus, verbindingsfout = false): string | null {
  if (verbindingsfout) return "Verbinding kwijt";
  if (rit.vervallen) return null;
  if (rit.rit_status === "INCOMING") {
    const leeftijd = rit.voertuig_info?.leeftijd_s ?? rit.voertuig?.leeftijd_s;
    return gpsVersheidLabel(leeftijd);
  }
  if (positieBevestigd(rit)) {
    const leeftijd = rit.nu_hier?.gps_leeftijd_s ?? rit.gps_leeftijd_s ?? rit.voertuig_info?.leeftijd_s;
    return gpsVersheidLabel(leeftijd);
  }
  if (rit.live && rit.nu_hier) return "KV8 halteberichten";
  return null;
}
