import AsyncStorage from "@react-native-async-storage/async-storage";

const INTRO_GEZIEN_KEY = "ovspot.korte-uitleg.v1";

/** Keep this independent of settings to avoid replacing any previous preferences. */
export async function korteUitlegGezien(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INTRO_GEZIEN_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markeerKorteUitlegGezien(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_GEZIEN_KEY, "1");
  } catch {
    // Storage unavailable: keep the app usable; the guide can reappear.
  }
}
