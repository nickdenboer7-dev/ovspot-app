import type { Instellingen, Startscherm, Tekstgrootte, Thema } from "./types";

export const DICHTBIJ_AFSTANDEN = [250, 500, 1000, 1500, 3000] as const;

export const STANDAARD_INSTELLINGEN: Instellingen = {
  thema: "systeem",
  donkerVan: 20,
  donkerTot: 7,
  taalVoorkeur: "auto",
  startscherm: "index",
  schermAanhouden: false,
  groteTekst: false,
  tekstgrootte: "normaal",
  hoogContrast: false,
  toonVertrekpreviews: true,
  liveVoertuigen: true,
  databesparing: false,
  storingenPush: false,
  filter: "alles",
  straal: 1500,
  thuis: null
};

export function normaliseerInstellingen(raw: unknown): Instellingen {
  const s = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Partial<Instellingen> : {};
  const thema: Thema = ["systeem","licht","donker","schema"].includes(String(s.thema))
    ? s.thema as Thema : "systeem";
  const startscherm: Startscherm = ["index","favorieten","storingen"].includes(String(s.startscherm))
    ? s.startscherm as Startscherm : "index";
  const straal = typeof s.straal === "number" || typeof s.straal === "string" ? Number(s.straal) : NaN;
  // Oude installaties kennen alleen de schakelaar 'Grotere tekst' (aan = Groot).
  const tekstgrootte: Tekstgrootte = ["klein","normaal","groot"].includes(String(s.tekstgrootte))
    ? s.tekstgrootte as Tekstgrootte : s.groteTekst === true ? "groot" : "normaal";
  return {
    ...STANDAARD_INSTELLINGEN,
    ...s,
    tekstgrootte,
    thema, startscherm,
    donkerVan: Number.isInteger(s.donkerVan) && s.donkerVan! >= 0 && s.donkerVan! <= 23 ? s.donkerVan! : STANDAARD_INSTELLINGEN.donkerVan,
    donkerTot: Number.isInteger(s.donkerTot) && s.donkerTot! >= 0 && s.donkerTot! <= 23 ? s.donkerTot! : STANDAARD_INSTELLINGEN.donkerTot,
    taalVoorkeur: ["auto","nl","en"].includes(String(s.taalVoorkeur)) ? s.taalVoorkeur! : "auto",
    schermAanhouden: typeof s.schermAanhouden === "boolean" ? s.schermAanhouden : false,
    groteTekst: tekstgrootte === "groot",
    hoogContrast: typeof s.hoogContrast === "boolean" ? s.hoogContrast : false,
    toonVertrekpreviews: typeof s.toonVertrekpreviews === "boolean"
      ? s.toonVertrekpreviews : STANDAARD_INSTELLINGEN.toonVertrekpreviews,
    liveVoertuigen: typeof s.liveVoertuigen === "boolean" ? s.liveVoertuigen : true,
    databesparing: typeof s.databesparing === "boolean" ? s.databesparing : false,
    storingenPush: typeof s.storingenPush === "boolean" ? s.storingenPush : false,
    filter: ["alles","trein","bus"].includes(String(s.filter)) ? s.filter! : "alles",
    straal: DICHTBIJ_AFSTANDEN.find(afstand => afstand === straal) ?? STANDAARD_INSTELLINGEN.straal,
    thuis: s.thuis && typeof s.thuis === "object"
      && typeof s.thuis.lat === "number" && typeof s.thuis.lon === "number"
      && Number.isFinite(s.thuis.lat) && Number.isFinite(s.thuis.lon)
      ? s.thuis : null
  };
}

/** Is het `uur` (0-23) donker volgens het schema? Werkt ook over middernacht heen (20 -> 7). */
export function isDonkerUur(uur: number, van: number, tot: number): boolean {
  if (van === tot) return false;
  return van < tot ? uur >= van && uur < tot : uur >= van || uur < tot;
}
