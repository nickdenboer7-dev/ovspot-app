/**
 * Expo's Android-location Promises hebben geen betrouwbare native annulering.
 * Beperk de volledige keten (permissie, services, cache en GPS) tot 5 seconden.
 * De signal-guard voorkomt dat een late native reactie alsnog resultaten zet.
 */
export const LOCATIE_TIMEOUT_MS = 5_000;

export class LocatieTimeoutFout extends Error {
  constructor() {
    super("Locatiebepaling duurt te lang");
    this.name = "LocatieTimeoutFout";
  }
}

export async function binnenLocatieTimeout<T>(
  taak: (signal: AbortSignal) => Promise<T>,
  ms = LOCATIE_TIMEOUT_MS
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) throw new RangeError("Timeout moet positief zijn");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => taak(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new LocatieTimeoutFout());
        }, ms);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}


/** Gegarandeerde, zichtbare positie als Android geen locatie teruggeeft. */
export type LocatiePositie = { lat: number; lon: number; bron: "gps" | "thuis" | "standaard" };
export const STANDAARD_LOCATIE: LocatiePositie = {
  lat: 52.3791, lon: 4.8994, bron: "standaard" // Amsterdam Centraal
};

export function kiesLocatieFallback(
  vorige: LocatiePositie | null,
  thuis?: { lat: number; lon: number } | null
): LocatiePositie {
  if (vorige?.bron === "gps" && Number.isFinite(vorige.lat) && Number.isFinite(vorige.lon)) return vorige;
  if (thuis && Number.isFinite(thuis.lat) && Number.isFinite(thuis.lon)) {
    return { lat: thuis.lat, lon: thuis.lon, bron: "thuis" };
  }
  return STANDAARD_LOCATIE;
}

type LocatiePunt = { coords: { latitude: number; longitude: number } };
export type LocatieProvider = {
  getForegroundPermissionsAsync: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestForegroundPermissionsAsync: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  hasServicesEnabledAsync: () => Promise<boolean>;
  getLastKnownPositionAsync: (opts: { maxAge: number; requiredAccuracy: number }) => Promise<LocatiePunt | null>;
  getCurrentPositionAsync: (opts: { accuracy: number }) => Promise<LocatiePunt>;
};

/** Eerst toestemming en providers; cached GPS is de primaire snelle bron.
 * Geen enkele late native Promise mag alsnog de UI bijwerken na de deadline.
 */
export async function vindGpsPositie(
  locatie: LocatieProvider,
  accuracy: number,
  signal: AbortSignal
): Promise<LocatiePositie> {
  const controleer = () => {
    if (signal.aborted) throw new Error("geannuleerd");
  };
  let perm = await locatie.getForegroundPermissionsAsync();
  controleer();
  if (!perm.granted && perm.canAskAgain) {
    perm = await locatie.requestForegroundPermissionsAsync();
    controleer();
  }
  if (!perm.granted) throw new Error(perm.canAskAgain ? "geweigerd" : "geweigerd-blijvend");
  if (!(await locatie.hasServicesEnabledAsync())) throw new Error("uit");
  controleer();

  const snel = await locatie.getLastKnownPositionAsync({ maxAge: 120_000, requiredAccuracy: 300 });
  controleer();
  if (snel && Number.isFinite(snel.coords.latitude) && Number.isFinite(snel.coords.longitude)) {
    return { lat: snel.coords.latitude, lon: snel.coords.longitude, bron: "gps" };
  }

  const precies = await locatie.getCurrentPositionAsync({ accuracy });
  controleer();
  if (!Number.isFinite(precies.coords.latitude) || !Number.isFinite(precies.coords.longitude)) {
    throw new Error("Ongeldige GPS-positie");
  }
  return { lat: precies.coords.latitude, lon: precies.coords.longitude, bron: "gps" };
}
