/** Herstel Dichtbij automatisch, maar vraag geweigerde permissies nooit in een lus. */
import type { LocatieReden } from "./locationTimeout";

export const GPS_HERSTEL_INTERVAL_MS = 15_000;

export function magGpsAutomatischHerstellen(fout: LocatieReden | null): boolean {
  return fout === "uit" || fout === "timeout" || fout === "fout";
}

export function moetGpsBijTerugkeerVernieuwd(
  fout: LocatieReden | null,
  laatsteSucces: number,
  nu: number,
  vernieuwNaMs: number
): boolean {
  if (fout !== null) return magGpsAutomatischHerstellen(fout);
  return laatsteSucces > 0 && nu - laatsteSucces >= vernieuwNaMs;
}
