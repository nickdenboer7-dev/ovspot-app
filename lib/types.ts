export type Modus = "train" | "bus" | "tram" | "metro" | "ferry" | string;

export type RitRef = {
  trip?: string; datum?: string; voertuig?: string;
  instap_halte?: string; instap_naam?: string; instap_ms?: number; richting?: string;
};

export type Vertrek = {
  lijn: string;
  lijn_naam: string;
  modus: Modus;
  bestemming: string;
  vervoerder: string;
  gepland: string;
  verwacht: string;
  vertrek_ms: number | null;
  vertraging_min: number;
  live: boolean;
  vervallen: boolean;
  spoor: string;
  rit: RitRef | null;
};

export type Storing = {
  id: string;
  soort: "minder" | "halte" | "omleiding" | "info" | string;
  label: string;
  titel: string;
  tekst: string;
  lijnen: string[];
  ernst: string;
  vanaf_ms: number | null;
  tot_ms: number | null;
  halte_ids: string[];
  haltes?: { id: string; naam: string }[];
};

export type Halte = {
  ok: boolean;
  id: string;
  naam: string;
  plaats: string;
  lat: number | null;
  lon: number | null;
  modi: Modus[];
  bijgewerkt: string;
  verouderd: boolean;
  vertrekken: Vertrek[];
  storingen: Storing[];
};

export type DichtbijHalte = {
  id: string;
  naam: string;
  plaats: string;
  afstand_m: number;
  lat: number | null;
  lon: number | null;
  modi: Modus[];
  lijnen: string[];
  vertrekken: Vertrek[];
  storingen_aantal?: number;
  fout: string | null;
};

export type Dichtbij = { ok: boolean; bijgewerkt: string; haltes: DichtbijHalte[] };

export type RitHalte = {
  id: string;
  naam: string;
  plaats: string;
  gepland: string;
  verwacht: string;
  tijd_ms: number | null;
  aankomst: string;
  vertrek: string;
  vertraging_min: number;
  live_tijd: boolean;
  bron_tijd?: "KV8" | "dienstregeling";
  spoor: string;
  spoor_gewijzigd: { van: string; naar: string } | null;
  status: "geweest" | "huidig" | "komt";
  vervalt: boolean;
};

export type NuHier = {
  bij_halte: boolean;
  na_index: number;
  volgende_index: number;
  volgende_naam: string;
  over_min: number | null;
  gps_leeftijd_s: number | null;
  afstand_tot_halte_m?: number | null;
};

export type Rit = {
  ok: boolean;
  id: string;
  lijn: string;
  lijn_naam: string;
  modus: Modus;
  bestemming: string;
  vervoerder: string;
  datum: string;
  live: boolean;
  tijden_bron?: "KV8" | "dienstregeling" | "overig";
  kv8_komende_haltes?: number | null;
  komende_haltes?: number | null;
  vertraging_min: number;
  vervallen: boolean;
  nu_hier: NuHier | null;
  positie_betrouwbaar?: boolean;
  gps_leeftijd_s?: number | null;
  instap_index?: number | null;
  haltes_totaal?: number;
  haltes: RitHalte[];
  storingen: Storing[];
  bijgewerkt: string;
};

export type StoringenAntwoord = { ok: boolean; bijgewerkt: string; aantal: number; storingen: Storing[]; niet_geladen: number; gevraagd?: number; gecontroleerd?: number };

export type ZoekResultaat = {
  id: string;
  soort: string;
  naam: string;
  plaats: string;
  modi: Modus[];
  lijnen_aantal: number | null;
  lat: number | null;
  lon: number | null;
};

export type Zoek = { ok: boolean; query: string; resultaten: ZoekResultaat[] };

export type FavHalte = { id: string; naam: string; plaats: string };

export type Thema = "systeem" | "licht" | "donker";
export type Filter = "alles" | "trein" | "bus";

export type Instellingen = {
  thema: Thema;
  filter: Filter;
  straal: number;
  thuis: { naam: string; plaats: string; lat: number; lon: number } | null;
};
