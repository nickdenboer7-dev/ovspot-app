const normaliseer = (tekst: string) => tekst.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const TREFWOORDEN: Record<string, string> = {
  Thema: "nachtmodus donkere modus dark mode",
  Taal: "nederlands dutch english",
  "Grotere tekst": "letters lettergrootte lettertype font size",
  "Hoog contrast": "zichtbaarheid visibility",
  Startscherm: "beginscherm home screen startup",
  "Scherm aanhouden": "schermtijd schermvergrendeling screen timeout sleep",
  Databesparing: "dataverbruik gps data usage",
  "Afstand voor Dichtbij": "zoekafstand zoekstraal radius loopafstand afstand locatie haltebord location departures",
  Zoekafstand: "afstanden straal loopafstand dichtbij haltes locatie nearby radius",
  "Vertrektijden op haltekaarten": "preview voorbeeld eerstvolgende vertrekken haltekaart nearby cards preview upcoming",
  "Standaard haltefilter": "vervoermiddel modaliteit filter locatie haltebord location departures",
  Thuislocatie: "thuis gps locatie haltebord location departures",
  Storingen: "vertraging push notificaties waarschuwing delay notifications alerts",
  "Korte uitleg": "symbolen betekenis hulp help",
};

export function instellingenZoektermen(invoer: string): string[] {
  return normaliseer(invoer).match(/[a-z0-9]+/g) ?? [];
}

export function instellingKomtOvereen(termen: readonly string[], titel: string, ...velden: string[]): boolean {
  const tekst = normaliseer([titel, ...velden, TREFWOORDEN[titel] ?? ""].join(" "));
  return termen.every(term => tekst.includes(term));
}
