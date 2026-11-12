/** Optional app-wide legibility setting, independent of Android system scaling. */
export const GROTE_TEKST_FACTOR = 1.18;
export const KLEINE_TEKST_FACTOR = 0.9;

/** true of "groot" = Groot, "klein" = Klein, alles anders = Normaal (geen aanpassing). */
export function tekstFactor(niveau: boolean | "klein" | "normaal" | "groot" | undefined): number | null {
  if (niveau === true || niveau === "groot") return GROTE_TEKST_FACTOR;
  if (niveau === "klein") return KLEINE_TEKST_FACTOR;
  return null;
}

export function vergrootLetterwaarden(
  fontSize: number | undefined,
  lineHeight: number | undefined,
  niveau: boolean | "klein" | "normaal" | "groot" | undefined
): { fontSize?: number; lineHeight?: number } | null {
  const factor = tekstFactor(niveau);
  if (factor === null || typeof fontSize !== "number" || !Number.isFinite(fontSize)) return null;
  return {
    fontSize: Math.round(fontSize * factor * 10) / 10,
    ...(typeof lineHeight === "number" && Number.isFinite(lineHeight)
      ? { lineHeight: Math.round(lineHeight * factor * 10) / 10 }
      : {})
  };
}
