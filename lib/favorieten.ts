import type { FavHalte } from "./types";

export const MAX_FAVORIETEN = 30;

export function herstelFavorietOpPositie(lijst: FavHalte[], halte: FavHalte, index: number): FavHalte[] {
  if (lijst.length >= MAX_FAVORIETEN || lijst.some((f) => f.id === halte.id)) return lijst;

  const nieuw = [...lijst];
  nieuw.splice(index, 0, halte);
  return nieuw;
}
