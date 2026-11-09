/** Optional app-wide legibility setting, independent of Android system scaling. */
export const GROTE_TEKST_FACTOR = 1.18;
export function vergrootLetterwaarden(
  fontSize: number | undefined,
  lineHeight: number | undefined,
  enabled: boolean
): { fontSize?: number; lineHeight?: number } | null {
  if (!enabled || typeof fontSize !== "number" || !Number.isFinite(fontSize)) return null;
  return {
    fontSize: Math.round(fontSize * GROTE_TEKST_FACTOR * 10) / 10,
    ...(typeof lineHeight === "number" && Number.isFinite(lineHeight)
      ? { lineHeight: Math.round(lineHeight * GROTE_TEKST_FACTOR * 10) / 10 }
      : {})
  };
}
