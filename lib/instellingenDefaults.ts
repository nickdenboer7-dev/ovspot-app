import type { Instellingen, Startscherm, Thema } from "./types";

export const DICHTBIJ_AFSTANDEN = [250, 500, 1000, 1500, 3000] as const;

export const STANDAARD_INSTELLINGEN: Instellingen = {
  thema: "systeem",
  taalVoorkeur: "auto",
  startscherm: "index",
  schermAanhouden: false,
  groteTekst: false,
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
  const thema: Thema = ["systeem","licht","donker"].includes(String(s.thema))
    ? s.thema as Thema : "systeem";
  const startscherm: Startscherm = ["index","favorieten","storingen"].includes(String(s.startscherm))
    ? s.startscherm as Startscherm : "index";
  const straal = typeof s.straal === "number" || typeof s.straal === "string" ? Number(s.straal) : NaN;
  return {
    ...STANDAARD_INSTELLINGEN,
    ...s,
    thema, startscherm,
    taalVoorkeur: ["auto","nl","en"].includes(String(s.taalVoorkeur)) ? s.taalVoorkeur! : "auto",
    schermAanhouden: typeof s.schermAanhouden === "boolean" ? s.schermAanhouden : false,
    groteTekst: typeof s.groteTekst === "boolean" ? s.groteTekst : false,
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
