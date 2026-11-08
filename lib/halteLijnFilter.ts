import type { Vertrek } from "./types";

/** Afgeleide lijnen uit de echte API-vertrekken, niet uit een geplande lijnencatalogus. */
export type HalteLijnFilter = Pick<Vertrek, "lijn" | "modus" | "vervoerder" | "kleur" | "tekstkleur" | "lijn_kleur" | "lijn_tekstkleur">;

export function uniekeHalteLijnen(vertrekken: readonly Vertrek[]): HalteLijnFilter[] {
  const lijnen = new Map<string, HalteLijnFilter>();
  for (const vertrek of vertrekken) {
    const lijn = typeof vertrek.lijn === "string" ? vertrek.lijn.trim() : "";
    if (!lijn) continue;
    const huidig = lijnen.get(lijn);
    // Behoud de eerste vervoerder/modus en gebruik de GTFS-badge als die later volgt.
    if (!huidig) {
      lijnen.set(lijn, { lijn, modus: vertrek.modus, vervoerder: vertrek.vervoerder,
        kleur: vertrek.kleur, tekstkleur: vertrek.tekstkleur,
        lijn_kleur: vertrek.lijn_kleur, lijn_tekstkleur: vertrek.lijn_tekstkleur });
    } else if (!huidig.kleur && !huidig.lijn_kleur && (vertrek.kleur || vertrek.lijn_kleur)) {
      lijnen.set(lijn, { ...huidig, kleur: vertrek.kleur, tekstkleur: vertrek.tekstkleur,
        lijn_kleur: vertrek.lijn_kleur, lijn_tekstkleur: vertrek.lijn_tekstkleur });
    }
  }
  return [...lijnen.values()];
}

/** Stapel line-filter op de bestaande modaliteitskeuze; behoud de API-tijdvolgorde. */
export function filterHalteVertrekken(
  vertrekken: readonly Vertrek[], modus: string, selectedLine: string | null
): Vertrek[] {
  return vertrekken.filter(vertrek =>
    (modus === "alles" || vertrek.modus === modus)
    && (selectedLine === null || vertrek.lijn.trim() === selectedLine)
  );
}
