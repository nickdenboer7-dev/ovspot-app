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

/** UI-kaarten per vervoerssoort; halte-ID's blijven de echte API-ID's. */
export type ZoekKaart = {
  key: string;
  halte: ZoekResultaat;
  modus: string | null;
  gesplitst: boolean;
  lijnen: CatalogLijn[];
  /** Alleen ter informatie bij de Trein-kaart; geen extra Bus-hoofdcategorie. */
  vervangendBusvervoer: boolean;
};

const TREIN_BINNENLAND: Record<string, number> = {
  sprinter: 0, spr: 0, intercity: 1, ic: 1,
  "intercity direct": 2, icd: 2, sneltrein: 3, stoptrein: 4, st: 4
};
const TREIN_INTERNATIONAAL = new Set([
  "eurocity direct", "european sleeper", "eurostar", "ice", "nightjet", "govolta"
]);

/** Alleen binnen dezelfde modus sorteren. Standaardtreinen eerst, internationale daarna. */
export function sorteerZoekLijnen(lijnen: CatalogLijn[]): CatalogLijn[] {
  return [...lijnen].sort((a, b) => {
    if (a.modus !== b.modus) return 0; // per-mode kaarten houden hun eigen catalogus
    if (a.modus === "train") {
      const an = a.lijn.trim().toLowerCase();
      const bn = b.lijn.trim().toLowerCase();
      const ar = Object.prototype.hasOwnProperty.call(TREIN_BINNENLAND, an) ? 0 : TREIN_INTERNATIONAAL.has(an) ? 2 : 1;
      const br = Object.prototype.hasOwnProperty.call(TREIN_BINNENLAND, bn) ? 0 : TREIN_INTERNATIONAAL.has(bn) ? 2 : 1;
      if (ar !== br) return ar - br;
      if (ar === 0) return TREIN_BINNENLAND[an] - TREIN_BINNENLAND[bn];
      return a.lijn.localeCompare(b.lijn, "nl", { numeric: true });
    }
    return a.lijn.localeCompare(b.lijn, "nl", { numeric: true });
  });
}

/** Dienstregelingsbussen ter vervanging van treinen zijn geen zelfstandig busstation. */
export function isVervangendeBuslijn(lijn: Pick<ZoekLijn, "lijn" | "modus">): boolean {
  return lijn.modus === "bus"
    && /^(?:snelbus|stopbus)\s+(?:ipv|i\.p\.v\.|in plaats van)\s+trein$/i.test(lijn.lijn.trim());
}

/** Deel alleen op als er echt meerdere modaliteiten met eigen lijnen zijn.
 * Vervangende treindiensten horen als melding bij het treinstation, tenzij er
 * óók normale buslijnen bestaan: dan blijven ze onder de Bus-kaart staan.
 */
export function maakZoekKaarten(resultaten: ZoekResultaat[]): ZoekKaart[] {
  return resultaten.flatMap<ZoekKaart>(halte => {
    const catalogus = geldigeLijnen(halte.lijnen);
    const heeftTrein = catalogus.some(l => l.modus === "train");
    const heeftGewoneBus = catalogus.some(l => l.modus === "bus" && !isVervangendeBuslijn(l));
    const heeftVervanging = catalogus.some(isVervangendeBuslijn);
    const vervangingBijTrein = heeftTrein && heeftVervanging && !heeftGewoneBus;
    const zichtbareLijnen = vervangingBijTrein
      ? catalogus.filter(l => !isVervangendeBuslijn(l)) : catalogus;
    const modi = [...new Set([...(halte.modi || []), ...zichtbareLijnen.map(l => l.modus)])]
      .filter(m => zichtbareLijnen.some(l => l.modus === m));
    if (modi.length < 2) {
      const enigeModus = modi[0] || ((halte.modi || []).length === 1 ? halte.modi[0] : null);
      return [{ key: `${halte.id}:alles`, halte, modus: enigeModus || null, gesplitst: false,
                lijnen: sorteerZoekLijnen(zichtbareLijnen), vervangendBusvervoer: vervangingBijTrein }];
    }
    return modi.map(modus => ({
      key: `${halte.id}:${modus}`, halte, modus, gesplitst: true,
      lijnen: sorteerZoekLijnen(zichtbareLijnen.filter(l => l.modus === modus)),
      vervangendBusvervoer: false
    }));
  });
}

/** GTFS-beschrijving > perroncode > plaats; nooit technische halte-ID's. */
export function zoekKaartSubtitel(kaart: ZoekKaart): string {
  const halte = kaart.halte;
  const onbruikbaar = (waarde: string): boolean => {
    const t = waarde.trim();
    return !t || norm(t) === norm(halte.id) || /^\d{4,}$/.test(t)
      || /^(?:stop[_ -]?id|halte[_ -]?id)\s*[:#=]?/i.test(t)
      || /^(?:NL:)?[A-Z]{1,5}:\d{4,}$/i.test(t);
  };
  const perron = (halte.perroncode || halte.platform_code || "").trim();
  const opties = [
    kaart.modus ? halte.modus_omschrijvingen?.[kaart.modus] : undefined,
    halte.omschrijving,
    halte.stop_desc,
    perron ? (/^(?:perron|platform|spoor)\b/i.test(perron) ? perron : `Perron ${perron}`) : undefined,
    halte.plaats
  ];
  for (const waarde of opties) {
    if (typeof waarde !== "string" || onbruikbaar(waarde)) continue;
    const kandidaat = waarde.trim();
    if (norm(kandidaat) !== norm(halte.naam)) return kandidaat;
  }
  return "";
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
