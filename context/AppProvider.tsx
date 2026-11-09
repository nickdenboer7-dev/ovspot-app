import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, useColorScheme } from "react-native";
import { dark, light, highContrastDark, highContrastLight, type Palette } from "../constants/theme";
import { api } from "../lib/api";
import { bewaarFavorieten, bewaarInstellingen, leesFavorieten, leesInstellingen, STANDAARD } from "../lib/storage";
import type { FavHalte, Instellingen, FeedbackContext, RecentFeedbackContext } from "../lib/types";
import { bepaalTaal, vertaling, type AppTaal } from "../lib/i18n";
import { korteUitlegGezien, markeerKorteUitlegGezien } from "../lib/onboardingGuide";

type AppContext = {
  klaar: boolean;
  colors: Palette;
  scheme: "light" | "dark";
  taal: AppTaal;
  t: (text: string) => string;
  uitlegZichtbaar: boolean;
  toonUitleg: () => void;
  sluitUitleg: () => void;
  instellingen: Instellingen;
  zetInstellingen: (patch: Partial<Instellingen>) => void;
  favorieten: FavHalte[];
  isFavoriet: (id: string) => boolean;
  wisselFavoriet: (h: FavHalte) => void;
  verwijderFavoriet: (id: string) => void;
  verplaatsFavoriet: (id: string, richting: -1 | 1) => void;
  dichtbijIds: string[];
  zetDichtbijIds: (ids: string[]) => void;
  storingenMijn: number;
  laatsteFeedbackContext: RecentFeedbackContext | null;
  zetFeedbackContext: (context: FeedbackContext) => void;
};

const Ctx = createContext<AppContext | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const systeem = useColorScheme();
  const [klaar, setKlaar] = useState(false);
  const [uitlegZichtbaar, setUitlegZichtbaar] = useState(false);
  const toonUitleg = useCallback(() => setUitlegZichtbaar(true), []);
  const sluitUitleg = useCallback(() => {
    setUitlegZichtbaar(false);
    void markeerKorteUitlegGezien();
  }, []);
  const [instellingen, setInstellingen] = useState<Instellingen>(STANDAARD);
  const [favorieten, setFavorieten] = useState<FavHalte[]>([]);
  const [dichtbijIds, zetDichtbijIds] = useState<string[]>([]);
  const [storingenMijn, setStoringenMijn] = useState(0);
  const [laatsteFeedbackContext, setLaatsteFeedbackContext] = useState<RecentFeedbackContext | null>(null);
  const zetFeedbackContext = useCallback((context: FeedbackContext) => {
    setLaatsteFeedbackContext({ ...context, vastgelegdOp: Date.now() });
  }, []);

  useEffect(() => {
    Promise.all([leesInstellingen(), leesFavorieten(), korteUitlegGezien()]).then(([s, f, gezien]) => {
      setInstellingen(s);
      setFavorieten(f);
      setUitlegZichtbaar(!gezien);
      setKlaar(true);
    });
  }, []);

  const scheme: "light" | "dark" =
    instellingen.thema === "donker" ? "dark" : instellingen.thema === "licht" ? "light" : systeem === "dark" ? "dark" : "light";
  const colors = instellingen.hoogContrast
    ? (scheme === "dark" ? highContrastDark : highContrastLight)
    : (scheme === "dark" ? dark : light);
  const taal = bepaalTaal(instellingen.taalVoorkeur);
  const t = useCallback((text: string) => vertaling(text, taal), [taal]);

  const zetInstellingen = useCallback((patch: Partial<Instellingen>) => {
    setInstellingen((oud) => {
      const nieuw = { ...oud, ...patch };
      bewaarInstellingen(nieuw);
      return nieuw;
    });
  }, []);

  const pasFavorietenAan = useCallback((fn: (oud: FavHalte[]) => FavHalte[]) => {
    setFavorieten((oud) => {
      const nieuw = fn(oud);
      bewaarFavorieten(nieuw);
      return nieuw;
    });
  }, []);

  const favIds = useMemo(() => new Set(favorieten.map((f) => f.id)), [favorieten]);
  const isFavoriet = useCallback((id: string) => favIds.has(id), [favIds]);
  const wisselFavoriet = useCallback(
    (h: FavHalte) => pasFavorietenAan((oud) => (oud.some((f) => f.id === h.id) ? oud.filter((f) => f.id !== h.id) : [...oud, h].slice(-30))),
    [pasFavorietenAan]
  );
  const verwijderFavoriet = useCallback((id: string) => pasFavorietenAan((oud) => oud.filter((f) => f.id !== id)), [pasFavorietenAan]);
  const verplaatsFavoriet = useCallback(
    (id: string, richting: -1 | 1) =>
      pasFavorietenAan((oud) => {
        const i = oud.findIndex((f) => f.id === id);
        const j = i + richting;
        if (i < 0 || j < 0 || j >= oud.length) return oud;
        const kopie = [...oud];
        [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
        return kopie;
      }),
    [pasFavorietenAan]
  );

  // Aantal storingen bij favorieten voor het rode bolletje op de tab (elke 3 minuten, alleen als de app open is).
  const favKey = favorieten.map((f) => f.id).join(",");
  const lopend = useRef(false);
  useEffect(() => {
    if (!favKey) {
      setStoringenMijn(0);
      return;
    }
    let actief = true;
    const ophalen = async () => {
      if (lopend.current || AppState.currentState !== "active") return;
      lopend.current = true;
      try {
        const r = await api.storingen(favKey.split(","));
        if (actief) setStoringenMijn(r.aantal);
      } catch {
        // stil: bolletje blijft zoals het was
      } finally {
        lopend.current = false;
      }
    };
    ophalen();
    const t = setInterval(ophalen, 180_000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && ophalen());
    return () => {
      actief = false;
      clearInterval(t);
      sub.remove();
    };
  }, [favKey]);

  const value = useMemo<AppContext>(
    () => ({
      klaar,
      colors,
      scheme,
      taal,
      t,
      uitlegZichtbaar,
      toonUitleg,
      sluitUitleg,
      instellingen,
      zetInstellingen,
      favorieten,
      isFavoriet,
      wisselFavoriet,
      verwijderFavoriet,
      verplaatsFavoriet,
      dichtbijIds,
      zetDichtbijIds,
      storingenMijn,
      laatsteFeedbackContext,
      zetFeedbackContext
    }),
    [klaar, colors, scheme, taal, t, uitlegZichtbaar, toonUitleg, sluitUitleg, instellingen, zetInstellingen, favorieten, isFavoriet, wisselFavoriet, verwijderFavoriet, verplaatsFavoriet, dichtbijIds, storingenMijn, laatsteFeedbackContext, zetFeedbackContext]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp buiten AppProvider");
  return v;
}
