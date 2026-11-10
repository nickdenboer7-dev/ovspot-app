/** Één bron van waarheid voor vertrekaanduidingen van bord én rit.
 * Reken met bronseconden; rond maximaal éénmaal, voor weergave, naar minuten.
 */
export type RitStatusSoort = "gepland" | "op_tijd" | "vertraagd" | "te_vroeg" | "vervallen";
export type RitStatusInvoer = { live: boolean; vervallen: boolean; afwijkingMin: number };
export type RitStatusWeergave = {
  soort: RitStatusSoort;
  tekst: string;
  afwijkingMin: number;
  heeftLive: boolean;
};

export function rondAfwijkingMinuten(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  const rounded = Math.round(Math.abs(seconds) / 60);
  return rounded === 0 ? 0 : Math.sign(seconds) * rounded;
}

export function bepaalRitStatus({ live, vervallen, afwijkingMin }: RitStatusInvoer): RitStatusWeergave {
  if (vervallen) return { soort: "vervallen", tekst: "Vervallen", afwijkingMin: 0, heeftLive: false };
  if (!live) return { soort: "gepland", tekst: "Gepland", afwijkingMin: 0, heeftLive: false };
  // Integer afwijkingMin is reeds afgerond door de bron of de rit-helper. Niet opnieuw afronden.
  const n = Number.isFinite(afwijkingMin) ? Math.trunc(afwijkingMin) : 0;
  if (n > 0) return { soort: "vertraagd", tekst: `Vertraagd +${n} min`, afwijkingMin: n, heeftLive: true };
  if (n < 0) return { soort: "te_vroeg", tekst: `Te vroeg ${Math.abs(n)} min`, afwijkingMin: n, heeftLive: true };
  return { soort: "op_tijd", tekst: "Live op tijd", afwijkingMin: 0, heeftLive: true };
}

export function afwijkingTekst(minuten: number): string {
  return minuten > 0 ? "+" + minuten + " min"
    : minuten < 0 ? Math.abs(minuten) + " min te vroeg" : "Op tijd";
}

export function tijdTotVertrek(vertrekMs: number | null, nu: number): string {
  if (vertrekMs === null || !Number.isFinite(vertrekMs)) return "";
  const diff = vertrekMs - nu;
  if (diff <= 0) return "Vertrokken";
  if (diff <= 30_000) return "aankomend";
  if (diff > 24 * 3600_000) {
    const parts = new Intl.DateTimeFormat("nl-NL", {
      timeZone: "Europe/Amsterdam", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(new Date(vertrekMs));
    return parts;
  }
  const min = Math.round(diff / 60_000);
  if (min < 60) return `over ${Math.max(1, min)} min`;
  const uur = Math.floor(min / 60);
  return `over ${uur} u ${min % 60} min`;
}

/** Een oude timestamp is geen actuele live-feed; max. 3 minuten versheid. */
export function heeftActueelLive(live: boolean, bijgewerktMs: number | null, nu: number): boolean {
  if (!live || bijgewerktMs === null || !Number.isFinite(bijgewerktMs)) return false;
  return bijgewerktMs <= nu + 5_000 && nu - bijgewerktMs <= 180_000;
}

/** Live-balk mag de leeftijd van een API-antwoord nooit als 'live' presenteren
 * bij alleen geplande ritten. Bron=officiële data-timestamp, niet een UI-klok.
 */
export function liveBalkTekst(live: boolean, bijgewerktMs: number | null, nu: number): string {
  if (!heeftActueelLive(live, bijgewerktMs, nu)) {
    return "Dienstregeling · geen live gegevens";
  }
  const sec = Math.max(0, Math.floor((nu - bijgewerktMs!) / 1000));
  return `Live · bijgewerkt ${sec} s geleden`;
}

/** Alleen naar de meegegeven instap-halte scrollen; nooit raden op de huidige GPS-halte. */
export function jouwHalteIndex(haltes: ReadonlyArray<{ id: string; naam: string }>,
  instapId?: string, instapNaam?: string): number {
  if (!instapId && !instapNaam) return -1;
  if (instapId) {
    const index = haltes.findIndex(h => h.id === instapId);
    if (index >= 0) return index;
  }
  if (!instapNaam) return -1;
  const normaliseer = (s: string) => s.trim().toLocaleLowerCase("nl-NL");
  const match = haltes.map((h,i) => ({ h,i })).filter(({ h }) =>
    normaliseer(h.naam) === normaliseer(instapNaam));
  return match.length === 1 ? match[0].i : -1;
}

/** Alleen een lopend én betrouwbaar GPS-segment krijgt de volledige next-highlight. */
export function toonVolgendeHighlight(segmentBekend: boolean, voertuigRijdt: boolean): boolean {
  return segmentBekend && voertuigRijdt;
}
