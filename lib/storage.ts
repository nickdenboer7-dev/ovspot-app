import AsyncStorage from "@react-native-async-storage/async-storage";
import { MAX_FAVORIETEN, normaliseerLijnFavorieten } from "./favorieten";
import type { FavHalte, FavLijn, Instellingen } from "./types";
import { normaliseerInstellingen, STANDAARD_INSTELLINGEN } from "./instellingenDefaults";

const FAV_KEY = "ovspot.favorieten.v1";
const FAV_LIJN_KEY = "ovspot.favorieteLijnen.v1";
const SET_KEY = "ovspot.instellingen.v1";

export const STANDAARD: Instellingen = STANDAARD_INSTELLINGEN;

async function lees<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function schrijf(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // opslag vol of niet beschikbaar: app blijft werken, alleen niet bewaard
  }
}

export async function leesFavorieten(): Promise<FavHalte[]> {
  const list = await lees<FavHalte[]>(FAV_KEY, []);
  return Array.isArray(list) ? list.filter((f) => f && typeof f.id === "string").slice(0, MAX_FAVORIETEN) : [];
}

let favorietenSchrijfrij = Promise.resolve();
function schrijfFavorieten(key: string, list: FavHalte[] | FavLijn[]): Promise<void> {
  favorietenSchrijfrij = favorietenSchrijfrij.then(() => schrijf(key, list));
  return favorietenSchrijfrij;
}
export const bewaarFavorieten = (list: FavHalte[]) => schrijfFavorieten(FAV_KEY, list);

export async function leesLijnFavorieten(): Promise<FavLijn[]> {
  return normaliseerLijnFavorieten(await lees<unknown>(FAV_LIJN_KEY, []));
}

export const bewaarLijnFavorieten = (list: FavLijn[]) => schrijfFavorieten(FAV_LIJN_KEY, list);

export async function leesInstellingen(): Promise<Instellingen> {
  const s = await lees<Partial<Instellingen>>(SET_KEY, {});
  return normaliseerInstellingen(s);
}

export const bewaarInstellingen = (s: Instellingen) => schrijf(SET_KEY, s);
