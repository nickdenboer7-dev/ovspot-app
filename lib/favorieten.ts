import { bestemmingVoorWeergave } from "./format.ts";
import type { FavLijn, Vertrek } from "./types";

export const MAX_FAVORIETEN = 30;

export function herstelFavorietOpPositie<T extends { id: string }>(lijst: T[], favoriet: T, index: number): T[] {
  if (lijst.length >= MAX_FAVORIETEN || lijst.some((f) => f.id === favoriet.id)) return lijst;

  const nieuw = [...lijst];
  nieuw.splice(index, 0, favoriet);
  return nieuw;
}

export function wisselInFavorieten<T extends { id: string }>(lijst: T[], favoriet: T): T[] {
  return lijst.some((f) => f.id === favoriet.id)
    ? lijst.filter((f) => f.id !== favoriet.id)
    : [...lijst, favoriet].slice(-MAX_FAVORIETEN);
}

export function verplaatsInFavorieten<T extends { id: string }>(lijst: T[], id: string, richting: -1 | 1): T[] {
  const index = lijst.findIndex((favoriet) => favoriet.id === id);
  const doel = index + richting;
  if (index < 0 || doel < 0 || doel >= lijst.length) return lijst;

  const nieuw = [...lijst];
  [nieuw[index], nieuw[doel]] = [nieuw[doel], nieuw[index]];
  return nieuw;
}

type LijnRichting = Pick<FavLijn, "lijn" | "richting" | "modus" | "vervoerder">;
const sleutel = (tekst: string) => tekst.trim().replace(/\s+/g, " ").normalize("NFC").toLocaleLowerCase("nl");

export function maakLijnFavoriet(data: Omit<FavLijn, "id">): FavLijn | null {
  const { halte, modus, vervoerder } = data;
  const lijn = data.lijn.trim();
  const richting = bestemmingVoorWeergave(lijn, data.richting.trim());
  if (!halte.id.trim() || !halte.naam.trim() || !lijn || !richting || !modus.trim()) return null;
  return {
    ...data,
    lijn,
    richting,
    id: JSON.stringify([halte.id, sleutel(lijn), sleutel(richting), sleutel(modus), sleutel(vervoerder)])
  };
}

export function vertrekBijLijnFavoriet(vertrek: Pick<Vertrek, "lijn" | "bestemming" | "modus" | "vervoerder">, favoriet: LijnRichting): boolean {
  return sleutel(vertrek.lijn) === sleutel(favoriet.lijn)
    && sleutel(vertrek.modus) === sleutel(favoriet.modus)
    && sleutel(vertrek.vervoerder) === sleutel(favoriet.vervoerder)
    && sleutel(bestemmingVoorWeergave(vertrek.lijn, vertrek.bestemming)) === sleutel(favoriet.richting);
}

export function normaliseerLijnFavorieten(data: unknown): FavLijn[] {
  if (!Array.isArray(data)) return [];
  const favorieten = new Map<string, FavLijn>();
  for (const item of data) {
    if (!item || !item.halte || typeof item.halte.id !== "string" || typeof item.halte.naam !== "string"
      || typeof item.halte.plaats !== "string" || typeof item.lijn !== "string" || typeof item.richting !== "string"
      || typeof item.modus !== "string" || typeof item.vervoerder !== "string") continue;
    const favoriet = maakLijnFavoriet({
      halte: { id: item.halte.id, naam: item.halte.naam, plaats: item.halte.plaats },
      lijn: item.lijn, richting: item.richting, modus: item.modus, vervoerder: item.vervoerder,
      ...(typeof item.kleur === "string" ? { kleur: item.kleur } : {}),
      ...(typeof item.tekstkleur === "string" ? { tekstkleur: item.tekstkleur } : {})
    });
    if (favoriet && !favorieten.has(favoriet.id)) favorieten.set(favoriet.id, favoriet);
    if (favorieten.size === MAX_FAVORIETEN) break;
  }
  return [...favorieten.values()];
}
