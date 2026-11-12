import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, useColorScheme } from "react-native";
import { dark, light, highContrastDark, highContrastLight, type Palette } from "../constants/theme";
import { registreerPush } from "../lib/push";
import { isDonkerUur } from "../lib/instellingenDefaults";
import { api } from "../lib/api";
import { herstelFavorietOpPositie, verplaatsInFavorieten, wisselInFavorieten } from "../lib/favorieten";
import { bewaarFavorieten, bewaarInstellingen, bewaarLijnFavorieten, leesFavorieten, leesInstellingen, leesLijnFavorieten, STANDAARD } from "../lib/storage";
import type { FavHalte, FavLijn, Instellingen, FeedbackContext, RecentFeedbackContext } from "../lib/types";
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
  herstelFavoriet: (halte: FavHalte, index: number) => void;
  verplaatsFavoriet: (id: string, richting: -1 | 1) => void;
  favorietenLijnen: FavLijn[];
  isLijnFavoriet: (id: string) => boolean;
  wisselLijnFavoriet: (favoriet: FavLijn) => void;
  verwijderLijnFavoriet: (id: string) => void;
  herstelLijnFavoriet: (favoriet: FavLijn, index: number) => void;
  verplaatsLijnFavoriet: (id: string, richting: -1 | 1) => void;
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
  const geplandeFavorieten = useRef<FavHalte[] | null>(null);
  const [favorietenLijnen, setFavorietenLijnen] = useState<FavLijn[]>([]);
  const geplandeLijnFavorieten = useRef<FavLijn[] | null>(null);
  const [dichtbijIds, zetDichtbijIds] = useState<string[]>([]);
  const [storingenMijn, setStoringenMijn] = useState(0);
  const [laatsteFeedbackContext, setLaatsteFeedbackContext] = useState<RecentFeedbackContext | null>(null);
  const zetFeedbackContext = useCallback((context: FeedbackContext) => {
    setLaatsteFeedbackContext({ ...context, vastgelegdOp: Date.now() });
  }, []);

  useEffect(() => {
    Promise.all([leesInstellingen(), leesFavorieten(), korteUitlegGezien(), leesLijnFavorieten()]).then(([s, f, gezien, lijnen]) => {
      setInstellingen(s);
      geplandeFavorieten.current = f;
      setFavorieten(f);
      geplandeLijnFavorieten.current = lijnen;
      setFavorietenLijnen(lijnen);
      setUitlegZichtbaar(!gezien);
      setKlaar(true);
    });
  }, []);

  const [tijdNu, zetTijdNu] = useState(() => Date.now());
  useEffect(() => {
    if (instellingen.thema !== "schema") return;
    zetTijdNu(Date.now());
    const timer = setInterval(() => zetTijdNu(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [instellingen.thema]);
  // Houdt de favoriete lijnen op de server actueel zolang meldingen aanstaan.
  useEffect(() => {
    if (!klaar || !instellingen.storingenPush) return;
    registreerPush(favorietenLijnen, true).catch(() => {});
  }, [klaar, instellingen.storingenPush, favorietenLijnen]);
  const scheme: "light" | "dark" =
    instellingen.thema === "donker" ? "dark" : instellingen.thema === "licht" ? "light"
      : instellingen.thema === "schema"
        ? (isDonkerUur(new Date(tijdNu).getHours(), instellingen.donkerVan, instellingen.donkerTot) ? "dark" : "light")
        : systeem === "dark" ? "dark" : "light";
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

  useEffect(() => {
    if (!klaar || geplandeFavorieten.current === favorieten) return;
    geplandeFavorieten.current = favorieten;
    void bewaarFavorieten(favorieten);
  }, [klaar, favorieten]);
  useEffect(() => {
    if (!klaar || geplandeLijnFavorieten.current === favorietenLijnen) return;
    geplandeLijnFavorieten.current = favorietenLijnen;
    void bewaarLijnFavorieten(favorietenLijnen);
  }, [klaar, favorietenLijnen]);

  const favIds = useMemo(() => new Set(favorieten.map((f) => f.id)), [favorieten]);
  const isFavoriet = useCallback((id: string) => favIds.has(id), [favIds]);
  const wisselFavoriet = useCallback(
    (h: FavHalte) => setFavorieten((oud) => wisselInFavorieten(oud, h)),
    []
  );
  const verwijderFavoriet = useCallback((id: string) => setFavorieten((oud) => oud.filter((f) => f.id !== id)), []);
  const herstelFavoriet = useCallback(
    (halte: FavHalte, index: number) => setFavorieten((oud) => herstelFavorietOpPositie(oud, halte, index)),
    []
  );
  const verplaatsFavoriet = useCallback(
    (id: string, richting: -1 | 1) => setFavorieten((oud) => verplaatsInFavorieten(oud, id, richting)),
    []
  );

  const isLijnFavoriet = useCallback((id: string) => favorietenLijnen.some((f) => f.id === id), [favorietenLijnen]);
  const wisselLijnFavoriet = useCallback(
    (favoriet: FavLijn) => setFavorietenLijnen((oud) => wisselInFavorieten(oud, favoriet)),
    []
  );
  const verwijderLijnFavoriet = useCallback((id: string) => setFavorietenLijnen((oud) => oud.filter((f) => f.id !== id)), []);
  const herstelLijnFavoriet = useCallback(
    (favoriet: FavLijn, index: number) => setFavorietenLijnen((oud) => herstelFavorietOpPositie(oud, favoriet, index)),
    []
  );
  const verplaatsLijnFavoriet = useCallback(
    (id: string, richting: -1 | 1) => setFavorietenLijnen((oud) => verplaatsInFavorieten(oud, id, richting)),
    []
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
      herstelFavoriet,
      verplaatsFavoriet,
      favorietenLijnen,
      isLijnFavoriet,
      wisselLijnFavoriet,
      verwijderLijnFavoriet,
      herstelLijnFavoriet,
      verplaatsLijnFavoriet,
      dichtbijIds,
      zetDichtbijIds,
      storingenMijn,
      laatsteFeedbackContext,
      zetFeedbackContext
    }),
    [klaar, colors, scheme, taal, t, uitlegZichtbaar, toonUitleg, sluitUitleg, instellingen, zetInstellingen, favorieten, isFavoriet, wisselFavoriet, verwijderFavoriet, herstelFavoriet, verplaatsFavoriet, favorietenLijnen, isLijnFavoriet, wisselLijnFavoriet, verwijderLijnFavoriet, herstelLijnFavoriet, verplaatsLijnFavoriet, dichtbijIds, storingenMijn, laatsteFeedbackContext, zetFeedbackContext]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp buiten AppProvider");
  return v;
}
