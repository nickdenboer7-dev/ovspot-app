import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FavHalte, Instellingen } from "./types";
import { normaliseerInstellingen, STANDAARD_INSTELLINGEN } from "./instellingenDefaults";

const FAV_KEY = "ovspot.favorieten.v1";
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
  return Array.isArray(list) ? list.filter((f) => f && typeof f.id === "string").slice(0, 30) : [];
}

export const bewaarFavorieten = (list: FavHalte[]) => schrijf(FAV_KEY, list);

export async function leesInstellingen(): Promise<Instellingen> {
  const s = await lees<Partial<Instellingen>>(SET_KEY, {});
  return normaliseerInstellingen(s);
}

export const bewaarInstellingen = (s: Instellingen) => schrijf(SET_KEY, s);
