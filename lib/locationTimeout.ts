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
