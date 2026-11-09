export type FeedbackCategorie = "kaart_data" | "idee" | "bug" | "overig";

export type FeedbackContext = {
  view: "instellingen" | "halte" | "rit";
  stop_id?: string;
  stop_name?: string;
  rit_id?: string;
  rit_datum?: string;
};

export type RecentFeedbackContext = FeedbackContext & { vastgelegdOp: number };

export type FeedbackInzending = {
  client_id: string;
  category: FeedbackCategorie;
  message: string;
  contact: string;
  app_version: string;
  ota_version: string;
  os_version: string;
  reported_at: string;
  context: FeedbackContext;
};

export type Modus = "train" | "bus" | "tram" | "metro" | "ferry" | string;

export type LiveRitPositie = {
  voertuignummer: string;
  lijnnummer: string;
  lat: number;
  lon: number;
  timestamp: number;
  leeftijd_s: number;
  richting: number | null;
};

export type LiveRitVoertuigAntwoord = {
  ok: boolean;
  bron: string;
  rit_id: string;
  datum: string;
  tijdstip: number;
  beschikbaar: boolean;
  voertuig: LiveRitPositie | null;
};

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
  /** Officiële GTFS-routekleuren; bij oudere Live-API's zijn lijn_*-velden beschikbaar. */
  kleur?: string;
  tekstkleur?: string;
  lijn_kleur?: string;
  lijn_tekstkleur?: string;
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
  /** GTFS-route-modaliteit per melding; ontbreekt op oudere API-servers. */
  modi?: Modus[];
  modus?: Modus;
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
  /** Volledig statisch GTFS-routeoverzicht voor deze halte, ook zonder vertrek nu. */
  lijncatalogus?: ZoekLijn[];
  vertrekken: Vertrek[];
  storingen: Storing[];
};

/** /app/v2/vertrektijden: echte fysieke haltes binnen 350 m van het station. */
export type StationVertrektijden = {
  ok: boolean;
  halte_id: string | null;
  naam: string;
  lat: number;
  lon: number;
  cluster_straal_m: number;
  types: Modus[];
  bijgewerkt: string;
  nacht_fallback: boolean;
  /** Alle GTFS-routekoppelingen op echte perrons binnen de 350m-cluster. */
  lijncatalogus?: ZoekLijn[];
  aantal: number;
  haltes: { id: string; naam: string; afstand_m: number; perron: string }[];
  vertrekken: (Vertrek & {
    type: Modus; lijnnummer: string; stop_id: string;
    halte: string; haltepaal: string | null; perron: string | null;
    planned_departure: string; expected_departure: string;
  })[];
};

/** /app/v2/lijnvertrekken: volledige gekozen lijn voor deze GTFS-dienstdag. */
export type LijnVertrekken = {
  ok: boolean;
  halte_id: string;
  lijn: string;
  modus: Modus | "alles";
  datum: string;
  bijgewerkt: string;
  aantal: number;
  vertrekken: Vertrek[];
  volgende_rit: Vertrek | null;
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

export type Dichtbij = {
  ok: boolean;
  bijgewerkt: string;
  haltes: DichtbijHalte[];
  radius?: number;
  heeft_meer?: boolean;
  volgende_offset?: number | null;
};

export type HalteState = "PASSED" | "ARRIVED" | "APPROACHING" | "SCHEDULED";
export type RitStatus = "DRIVING" | "ARRIVED" | "SCHEDULED" | "PASSED" | "INCOMING" | string;

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
  spoor: string;
  spoor_gewijzigd: { van: string; naar: string } | null;
  status: "geweest" | "huidig" | "komt";
  state?: HalteState;
  vervalt: boolean;
};

export type NuHier = {
  bij_halte: boolean;
  na_index: number;
  volgende_index: number;
  volgende_naam: string;
  over_min: number | null;
  gps_leeftijd_s: number | null;
};

export type RitVoertuig = {
  nummer?: string | null;
  snelheid_kmh?: number | null;
  soort?: string | null;
  lat?: number | null;
  lon?: number | null;
  leeftijd_s?: number | null;
};

export type RitKaartPunt = { latitude: number; longitude: number };

export type RitKaartHalte = RitKaartPunt & {
  stop_id: string;
  stop_name: string;
  stop_sequence: number;
  gepasseerd?: boolean;
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
  vertraging_min: number;
  vervallen: boolean;
  nu_hier: NuHier | null;
  positie_betrouwbaar?: boolean;
  live_positie?: boolean;
  gps_betrouwbaar?: boolean;
  rit_status?: RitStatus;
  status_omschrijving?: string | null;
  voertuig?: RitVoertuig | null;
  voertuig_info?: RitVoertuig | null;
  gps_leeftijd_s?: number | null;
  haltes: RitHalte[];
  /** Geordende GTFS shape (of fysieke haltes als fallback), optioneel op oudere API's. */
  shape?: RitKaartPunt[];
  stops?: RitKaartHalte[];
  route_color?: string;
  shape_bron?: "gtfs" | "stops" | "geen";
  storingen: Storing[];
  bijgewerkt: string;
};

export type StoringenAntwoord = { ok: boolean; bijgewerkt: string; aantal: number; storingen: Storing[]; niet_geladen: number; gevraagd?: number; gecontroleerd?: number };

export type ZoekLijn = {
  lijn: string;
  modus: Modus;
  vervoerder: string;
  kleur?: string;
  tekstkleur?: string;
};

export type ZoekResultaat = {
  id: string;
  soort: string;
  naam: string;
  plaats: string;
  modi: Modus[];
  lijnen_aantal: number | null;
  lijnen?: ZoekLijn[];
  /** Uitsluitend officiële GTFS-stopgegevens; ontbrekend bij oudere API's. */
  omschrijving?: string;
  modus_omschrijvingen?: Record<string, string>;
  stop_desc?: string;
  perroncode?: string;
  platform_code?: string;
  sub?: string;
  lat: number | null;
  lon: number | null;
};

export type Zoek = { ok: boolean; query: string; resultaten: ZoekResultaat[] };

export type FavHalte = { id: string; naam: string; plaats: string };

export type Thema = "systeem" | "licht" | "donker";
export type Filter = "alles" | "trein" | "bus";
export type Startscherm = "index" | "favorieten" | "storingen";

export type Instellingen = {
  thema: Thema;
  taalVoorkeur: "auto" | "nl" | "en";
  startscherm: Startscherm;
  schermAanhouden: boolean;
  groteTekst: boolean;
  hoogContrast: boolean;
  liveVoertuigen: boolean;
  databesparing: boolean;
  storingenPush: boolean;
  // Bestaande voorkeuren blijven beschikbaar voor GPS-fallback en halteborden.
  filter: Filter;
  straal: number;
  thuis: { naam: string; plaats: string; lat: number; lon: number } | null;
};
