import type { DichtbijHalte, Modus, Vertrek } from "./types";

export type VertrekBijPaal = { halteId: string; vertrek: Vertrek };
export type HalteGroep = {
  id: string;
  naam: string;
  plaats: string;
  afstand_m: number;
  modi: Modus[];
  storingen_aantal: number;
  fout: string | null;
  haltes: DichtbijHalte[];
  vertrekken: VertrekBijPaal[];
};

const MAX_PAAL_AFSTAND_M = 80;

function coord(h: DichtbijHalte): boolean {
  return typeof h.lat === "number" && typeof h.lon === "number"
    && Number.isFinite(h.lat) && Number.isFinite(h.lon);
}

function afstandPalen(a: DichtbijHalte, b: DichtbijHalte): number {
  const r = Math.PI / 180;
  const p1 = a.lat! * r, p2 = b.lat! * r;
  const dp = (b.lat! - a.lat!) * r, dl = (b.lon! - a.lon!) * r;
  const z = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(z)));
}

function eerstVertrekken(haltes: DichtbijHalte[]): VertrekBijPaal[] {
  const maxPerPaal = 2;
  const kandidaten = haltes.flatMap((h) =>
    [...(h.vertrekken || [])]
      .sort((a, b) => (a.vertrek_ms ?? Infinity) - (b.vertrek_ms ?? Infinity))
      .slice(0, maxPerPaal)
      .map((vertrek) => ({ halteId: h.id, vertrek }))
  );
  kandidaten.sort((a, b) => (a.vertrek.vertrek_ms ?? Infinity) - (b.vertrek.vertrek_ms ?? Infinity)
    || a.halteId.localeCompare(b.halteId));
  const seen = new Set<string>();
  return kandidaten.filter(({ vertrek }) => {
    const ref = vertrek.rit;
    const key = [ref?.trip || "", ref?.datum || "", vertrek.vervoerder, vertrek.lijn,
      vertrek.bestemming, vertrek.vertrek_ms ?? vertrek.verwacht ?? vertrek.gepland].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, haltes.length > 1 ? 4 : 2);
}

/**
 * Voeg alleen echte overstaande haltepalen samen: dezelfde naam en plaats én
 * minder dan 80 m ertussen. Als GPS-coördinaten ontbreken, alleen direct
 * opeenvolgende gelijknamige resultaten samenvoegen. De kortste paal is de
 * primaire navigatiebestemming; iedere vertrekrij behoudt zijn eigen halte-ID.
 */
export function groepeerDichtbijHaltes(input: readonly DichtbijHalte[]): HalteGroep[] {
  const geordend = [...input].sort((a, b) => a.afstand_m - b.afstand_m);
  const groepen: { haltes: DichtbijHalte[]; laatstGezien: number }[] = [];
  geordend.forEach((halte, i) => {
    let groep = groepen.find((g) => {
      const referentie = g.haltes[0];
      if (halte.naam.trim() !== referentie.naam.trim()
          || halte.plaats.trim() !== referentie.plaats.trim()) return false;
      if (g.haltes.every(coord) && coord(halte)) {
        // Geen kettingclustering: elke nieuwe paal moet dichtbij ELKE paal liggen.
        return g.haltes.every((h) => afstandPalen(h, halte) < MAX_PAAL_AFSTAND_M);
      }
      return g.laatstGezien === i - 1; // Uitsluitend als coordinates ontbreken.
    });
    if (!groep) {
      groep = { haltes: [], laatstGezien: i };
      groepen.push(groep);
    }
    groep.haltes.push(halte);
    groep.laatstGezien = i;
  });
  return groepen.map(({ haltes }) => {
    const primair = haltes[0]; // Dichtstbijzijnde halte: originele IDs blijven intact.
    return {
      id: primair.id,
      naam: primair.naam,
      plaats: primair.plaats,
      afstand_m: primair.afstand_m,
      modi: [...new Set(haltes.flatMap((h) => h.modi || []))],
      storingen_aantal: haltes.reduce((n, h) => n + (h.storingen_aantal || 0), 0),
      fout: haltes.every((h) => !!h.fout) ? haltes[0].fout : null,
      haltes,
      vertrekken: eerstVertrekken(haltes)
    };
  });
}
