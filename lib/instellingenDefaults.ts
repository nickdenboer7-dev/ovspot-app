import type { Instellingen, Startscherm, Thema } from "./types";

export const STANDAARD_INSTELLINGEN: Instellingen = {
  thema: "systeem",
  startscherm: "index",
  schermAanhouden: false,
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
  return {
    ...STANDAARD_INSTELLINGEN,
    ...s,
    thema, startscherm,
    schermAanhouden: typeof s.schermAanhouden === "boolean" ? s.schermAanhouden : false,
    liveVoertuigen: typeof s.liveVoertuigen === "boolean" ? s.liveVoertuigen : true,
    databesparing: typeof s.databesparing === "boolean" ? s.databesparing : false,
    storingenPush: typeof s.storingenPush === "boolean" ? s.storingenPush : false,
    filter: ["alles","trein","bus"].includes(String(s.filter)) ? s.filter! : "alles",
    straal: [500,1000,1500,3000].includes(Number(s.straal)) ? Number(s.straal) : 1500,
    thuis: s.thuis && typeof s.thuis === "object"
      && typeof s.thuis.lat === "number" && typeof s.thuis.lon === "number"
      && Number.isFinite(s.thuis.lat) && Number.isFinite(s.thuis.lon)
      ? s.thuis : null
  };
}
