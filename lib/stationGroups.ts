import type { Halte, ZoekResultaat, StationVertrektijden, Vertrek } from "./types";
import { combineerStatischeLijnen } from "./halteLijnFilter.ts";

/** Het native stationsbord gebruikt de complete 350m-v2-vertrekken, niet
 * alleen de treinquays uit /halte. Metro en veerboot behouden hun eigen
 * bestaande bron, omdat /vertrektijden deze modi bewust niet ophaalt.
 */
export function voegStationVertrektijdenToe(station: Halte, cluster: StationVertrektijden | null): Halte {
  if (!cluster?.ok || cluster.halte_id !== station.id) return station;
  const overige = station.vertrekken.filter(v => v.modus === "metro" || v.modus === "ferry");
  const vertrekken = [...cluster.vertrekken, ...overige]
    .sort((a,b) => (a.vertrek_ms ?? 0) - (b.vertrek_ms ?? 0));
  // Combineer beide statische GTFS-catalogi: ook buslijnen die pas later rijden
  // blijven bestaan wanneer één van de endpoints minder routekoppelingen kent.
  const lijncatalogus = combineerStatischeLijnen(
    cluster.lijncatalogus, station.lijncatalogus
  );
  const modi = [...new Set([...station.modi, ...cluster.types,
    ...(lijncatalogus ?? []).map(v => v.modus), ...vertrekken.map(v => v.modus)])];
  return { ...station, bijgewerkt: cluster.bijgewerkt, vertrekken, modi, lijncatalogus };
}

/**
 * Compatibiliteit voor oude API-v2 instanties die alleen het treinperron van
 * een stationsgroep tonen. De server moet de volledige groep zelf aanbieden;
 * zolang dat ontbreekt kan de app een nabij busstation afzonderlijk ophalen.
 */
export function heeftBusstationAanvullingNodig(halte: Halte | null): halte is Halte {
  return !!halte && halte.modi.includes("train")
    && !halte.modi.includes("bus")
    && !halte.vertrekken.some(v => v.modus === "bus")
    && !!halte.plaats && halte.lat != null && halte.lon != null;
}

export function busstationZoekterm(halte: Halte): string {
  return `${halte.plaats.trim()}, Busstation`;
}

function afstandMeter(a: { lat: number | null; lon: number | null }, b: { lat: number | null; lon: number | null }): number {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return Infinity;
  const toRad = Math.PI / 180;
  const dy = (b.lat-a.lat)*toRad;
  const dx = (b.lon-a.lon)*toRad;
  const h = Math.sin(dy/2)**2 + Math.cos(a.lat*toRad)*Math.cos(b.lat*toRad)*Math.sin(dx/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.max(0,h))));
}

/** Alleen GTFS-zoekresultaten van het nabije, gelijknamige busstation gebruiken. */
export function kiesGekoppeldBusstation(station: Halte, resultaten: ZoekResultaat[]): ZoekResultaat | null {
  const naam = station.plaats.trim().toLocaleLowerCase("nl");
  const matches = resultaten.filter(r =>
    r.id !== station.id
    && r.modi.includes("bus")
    && r.naam.toLocaleLowerCase("nl").includes("busstation")
    && r.plaats.trim().toLocaleLowerCase("nl") === naam
    && afstandMeter(station, r) <= 250
  );
  matches.sort((a,b) => afstandMeter(station,a)-afstandMeter(station,b));
  return matches[0] ?? null;
}

function vertrekSleutel(v: Vertrek): string {
  return [
    v.modus, v.rit?.trip || "", v.rit?.datum || "", v.lijn,
    v.vertrek_ms ?? v.gepland, v.bestemming, v.spoor
  ].join("|");
}

/** Houd alle echt opgehaalde trein- en busvertrekken, zonder dubbele passages. */
export function voegBusstationToe(station: Halte, busstation: Halte | null): Halte {
  if (!busstation) return station;
  const uniek = new Map<string, Vertrek>();
  for (const v of [...station.vertrekken, ...busstation.vertrekken]) {
    const key = vertrekSleutel(v);
    if (!uniek.has(key)) uniek.set(key,v);
  }
  const vertrekken = [...uniek.values()].sort((a,b) => (a.vertrek_ms ?? 0)-(b.vertrek_ms ?? 0));
  const modi = [...new Set([...station.modi, ...busstation.modi, ...vertrekken.map(x => x.modus)])];
  return { ...station, vertrekken, modi };
}
