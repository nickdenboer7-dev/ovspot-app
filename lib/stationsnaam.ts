/** Alleen voor weergave: breek op Android liever na een koppelteken.
 * De oorspronkelijke halte-/stationsnaam in API en navigatie blijft ongewijzigd.
 * Voorkom dubbele breekpunten wanneer deze formatter opnieuw wordt toegepast.
 */
export function stationsnaamMetBreekpunten(naam: string): string {
  return naam.replace(/-(?!\u200B)/g, "-\u200B");
}
