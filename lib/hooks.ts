import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

export type Poll<T> = {
  data: T | null;
  fout: string | null;
  laden: boolean;
  laatsteOk: Date | null;
  verversen: () => Promise<void>;
  /** true zolang `data` uit de opslag komt en er nog geen verse reactie is. */
  uitCache: boolean;
};

/** Hoe oud opgeslagen data maximaal mag zijn om bij het openen direct te tonen. */
export const POLL_CACHE_MAX_MS = 5 * 60_000;
const POLL_CACHE_PREFIX = "ovspot_poll_v1:";
const geheugen = new Map<string, { t: number; d: unknown }>();


/**
 * Haalt data op zolang het scherm zichtbaar is en de app op de voorgrond staat.
 * interval mag afhangen van de laatste data (bijv. live rit elke 5 s, geplande rit elke 30 s).
 * Bij een fout blijft de laatste goede data staan en wordt het opnieuw geprobeerd.
 */
export function usePolling<T>(key: string, fetcher: () => Promise<T>, interval: number | ((data: T | null) => number), opties?: { bewaar?: boolean }): Poll<T> {
  const bewaar = !!opties?.bewaar;
  const [data, setData] = useState<T | null>(null);
  const [uitCache, setUitCache] = useState(false);
  const vers = useRef(false);
  const [fout, setFout] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [laatsteOk, setLaatsteOk] = useState<Date | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  const dataRef = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bezig = useRef(false);
  const actief = useRef(false);
  const keyRef = useRef(key);

  // Nieuwe sleutel (andere halte, ander filter): oude data weg.
  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      dataRef.current = null;
      setData(null);
      setFout(null);
      setLaden(true);
      setUitCache(false);
      vers.current = false;
    }
    if (!bewaar || vers.current || dataRef.current !== null) return;
    const toon = (d: T) => {
      if (vers.current || keyRef.current !== key || dataRef.current !== null) return;
      dataRef.current = d;
      setData(d);
      setLaden(false);
      setUitCache(true);
    };
    const mem = geheugen.get(key);
    if (mem && Date.now() - mem.t <= POLL_CACHE_MAX_MS) { toon(mem.d as T); return; }
    AsyncStorage.getItem(POLL_CACHE_PREFIX + key).then(raw => {
      if (!raw) return;
      try {
        const o = JSON.parse(raw) as { t: number; d: T };
        if (typeof o.t === "number" && Date.now() - o.t <= POLL_CACHE_MAX_MS && o.d) toon(o.d);
      } catch { /* kapotte opslag negeren */ }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const plan = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!actief.current) return;
    const iv = intervalRef.current;
    const ms = typeof iv === "function" ? iv(dataRef.current) : iv;
    timer.current = setTimeout(() => void run(), dataRef.current === null ? Math.min(ms, 5000) : ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = useCallback(async () => {
    if (bezig.current) return;
    if (AppState.currentState !== "active") {
      plan();
      return;
    }
    bezig.current = true;
    const voorKey = keyRef.current;
    try {
      const d = await fetcherRef.current();
      if (voorKey !== keyRef.current) return;
      dataRef.current = d;
      vers.current = true;
      setData(d);
      setUitCache(false);
      setFout(null);
      setLaatsteOk(new Date());
      if (bewaar && d) {
        const t = Date.now();
        geheugen.set(voorKey, { t, d });
        AsyncStorage.setItem(POLL_CACHE_PREFIX + voorKey, JSON.stringify({ t, d })).catch(() => {});
      }
    } catch (e: any) {
      if (voorKey === keyRef.current) setFout(e?.message || "Er ging iets mis");
    } finally {
      bezig.current = false;
      if (voorKey === keyRef.current) {
        setLaden(false);
        plan();
      } else if (actief.current) {
        // Sleutel veranderde tijdens het laden: direct voor de nieuwe sleutel ophalen.
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void run(), 0);
      }
    }
  }, [plan]);

  useFocusEffect(
    useCallback(() => {
      actief.current = true;
      void run();
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") void run();
      });
      return () => {
        actief.current = false;
        if (timer.current) clearTimeout(timer.current);
        sub.remove();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key])
  );

  const verversen = useCallback(async () => {
    await run();
  }, [run]);

  return { data, fout, laden, laatsteOk, verversen, uitCache };
}

/** Huidige tijd die elke `ms` ververst, voor aftellen zonder nieuwe netwerkvraag. */
export function useNu(ms = 10_000): number {
  const [nu, setNu] = useState(Date.now());
  useFocusEffect(
    useCallback(() => {
      setNu(Date.now());
      const t = setInterval(() => setNu(Date.now()), ms);
      return () => clearInterval(t);
    }, [ms])
  );
  return nu;
}
