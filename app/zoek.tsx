import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OnderBalk } from "../components/OnderBalk";
import { Leeg } from "../components/ui";
import { useApp } from "../context/AppProvider";
import { halteIcoon, halteKleur, lijnKleur } from "../constants/wayfinding";
import { api } from "../lib/api";
import type { Vertrek, ZoekResultaat } from "../lib/types";

type LijnVoorbeeld = Pick<Vertrek, "lijn" | "modus" | "vervoerder">;
type Voorbeelden = Record<string, LijnVoorbeeld[]>;

/** Voorbeeldbadges komen uit echte geplande vertrekken, niet uit fictieve vaste nummers. */
function enkeleLijnen(vertrekken: Vertrek[]): LijnVoorbeeld[] {
  const uniek = new Map<string, LijnVoorbeeld>();
  for (const v of vertrekken) {
    const key = v.modus + ":" + v.lijn + ":" + v.vervoerder;
    if (!uniek.has(key)) uniek.set(key, { lijn: v.lijn, modus: v.modus, vervoerder: v.vervoerder });
  }
  const alle = [...uniek.values()];
  // Gemengde stations: eerst verschillende modaliteiten, daarna de overige lijnen.
  const diverse: LijnVoorbeeld[] = [];
  const modi = new Set<string>();
  for (const x of alle) if (!modi.has(x.modus)) { diverse.push(x); modi.add(x.modus); }
  return [...diverse, ...alle.filter(x => !diverse.includes(x))].slice(0, 3);
}

export default function Zoek() {
  const { colors, zetInstellingen } = useApp();
  const { doel } = useLocalSearchParams<{ doel?: string }>();
  const voorThuis = doel === "thuis";
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [resultaten, setResultaten] = useState<ZoekResultaat[]>([]);
  const [voorbeelden, setVoorbeelden] = useState<Voorbeelden>({});
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const volgnr = useRef(0);

  useEffect(() => {
    const mijn = ++volgnr.current;
    const term = q.trim();
    setVoorbeelden({});
    setFout(null);
    if (term.length < 2) {
      setResultaten([]);
      setBezig(false);
      return;
    }
    setBezig(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.zoek(term);
        if (mijn !== volgnr.current) return;
        setResultaten(r.resultaten);
        // Maximaal vier aanvullende bordqueries, pas ná de zoekresultaten.
        // Zo blijft zoeken snel en blijven de badges echte vertreklijnen.
        if (!voorThuis && term.length >= 5 && r.resultaten.length <= 8) {
          for (const item of r.resultaten.slice(0, 4)) {
            if (mijn !== volgnr.current) break;
            void api.halte(item.id, "alles", 40).then(h => {
              if (mijn === volgnr.current) {
                setVoorbeelden(v => ({ ...v, [item.id]: enkeleLijnen(h.vertrekken) }));
              }
            }).catch(() => {
              // Alleen optionele voorbeeldbadges; het zoekresultaat blijft bruikbaar.
            });
          }
        }
      } catch (e: any) {
        if (mijn === volgnr.current) setFout(e?.message || "Zoeken lukt nu niet");
      } finally {
        if (mijn === volgnr.current) setBezig(false);
      }
    }, 260);
    return () => { clearTimeout(t); };
  }, [q, voorThuis]);

  const kies = (r: ZoekResultaat) => {
    if (voorThuis) {
      if (r.lat != null && r.lon != null) zetInstellingen({ thuis: { naam: r.naam, plaats: r.plaats, lat: r.lat, lon: r.lon } });
      router.back();
      return;
    }
    router.replace({
      pathname: "/halte/[id]",
      params: { id: r.id, van: "index", naam: r.naam, plaats: r.plaats, groep: r.sub || "" }
    });
  };

  const hasResults = resultaten.length > 0;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.kop, { backgroundColor: colors.header, paddingTop: insets.top + 8 }]}>
        <View style={s.kopRij}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Terug" style={s.terug} hitSlop={8}>
            <Ionicons name="arrow-back" size={26} color={colors.headerText} />
          </Pressable>
          <Text style={[s.kopTitel, { color: colors.headerText }]}>OVspot</Text>
        </View>
        <View style={[s.veld, { backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={21} color={colors.accent} />
          <TextInput
            autoFocus value={q} onChangeText={setQ}
            placeholder={voorThuis ? "Zoek je thuishalte" : "Zoek halte of plaats"}
            placeholderTextColor={colors.muted}
            style={[s.input, { color: colors.text }]}
            returnKeyType="search" autoCorrect={false} accessibilityLabel="Zoekterm"
          />
          {bezig ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          {q && !bezig ? (
            <Pressable onPress={() => setQ("")} accessibilityRole="button" accessibilityLabel="Wissen" hitSlop={10}>
              <Ionicons name="close-circle" size={21} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <FlatList
        data={resultaten}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.resultaten}
        ListHeaderComponent={hasResults ? (
          <View style={s.sectiekop}>
            <Text style={[s.sectietitel, { color: colors.sub }]}>ZOEKRESULTATEN</Text>
            <Text style={[s.sectieaantal, { color: colors.sub }]}>
              {resultaten.length} {resultaten.length === 1 ? "haltegroep" : "haltegroepen"}
            </Text>
          </View>
        ) : null}
        ListEmptyComponent={
          q.trim().length < 2 ? (
            <Leeg icoon="search-outline" titel={voorThuis ? "Kies je thuislocatie" : "Zoek een halte"} tekst="Typ minimaal twee letters, bijvoorbeeld Amsterdam Centraal." />
          ) : fout ? (
            <Leeg icoon="cloud-offline-outline" titel="Zoeken lukt nu niet" tekst={fout} />
          ) : bezig ? (
            <View style={s.laden}><ActivityIndicator color={colors.accent} /><Text style={{ color: colors.sub }}>Haltes zoeken…</Text></View>
          ) : (
            <Leeg icoon="help-circle-outline" titel="Niets gevonden" tekst={`Geen haltes voor "${q.trim()}". Probeer een andere naam of plaats.`} />
          )
        }
        renderItem={({ item }) => {
          const lijst = voorbeelden[item.id];
          const vervoerder = lijst?.find(x => x.vervoerder)?.vervoerder;
          const palet = halteKleur(item.modi, vervoerder);
          const icon = halteIcoon(item.modi);
          const rest = Math.max(0, (item.lijnen_aantal || 0) - (lijst?.length || 0));
          return (
            <Pressable
              onPress={() => kies(item)}
              style={[s.kaart, { backgroundColor: colors.surface, borderColor: colors.border }]}
              android_ripple={{ color: colors.divider }}
              accessibilityRole="button"
              accessibilityLabel={`${item.naam}, ${item.sub || item.modi.join(" en ")}, ${item.plaats}, ${item.lijnen_aantal || 0} lijnen`}
            >
              <View style={[s.icoon, { backgroundColor: palet.bg }]}>
                <Ionicons name={icon} size={24} color={palet.fg} />
              </View>
              <View style={s.midden}>
                <Text style={[s.naam, { color: colors.text }]} numberOfLines={1}>{item.naam}</Text>
                {!!item.plaats && <Text style={[s.plaats, { color: colors.sub }]} numberOfLines={1}>{item.plaats}</Text>}
                <Text style={[s.sub, { color: colors.sub }]} numberOfLines={2}>
                  {item.sub || (item.modi.includes("train") ? "Treinen · perrons" : item.modi.join(" en "))}
                </Text>
              </View>
              <View style={s.rechts}>
                {lijst?.length ? (
                  <View style={s.badges}>
                    {lijst.map(x => {
                      const k = lijnKleur(x.lijn, x.modus, x.vervoerder);
                      return (
                        <View key={x.modus + x.lijn + x.vervoerder} style={[s.badge, { backgroundColor: k.bg }]}>
                          <Text style={[s.badgeTekst, { color: k.fg }]} numberOfLines={1}>{x.lijn}</Text>
                        </View>
                      );
                    })}
                    {rest > 0 && (
                      <View style={[s.restBadge, { backgroundColor: colors.surface2 }]}>
                        <Text style={[s.restTekst, { color: colors.sub }]}>+{rest}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={[s.aantal, { color: colors.sub }]}>{item.lijnen_aantal ? `${item.lijnen_aantal} ${item.lijnen_aantal === 1 ? "lijn" : "lijnen"}` : ""}</Text>
                )}
                <Ionicons name={voorThuis ? "home-outline" : "chevron-forward"} size={18} color={colors.sub} />
              </View>
            </Pressable>
          );
        }}
      />
      {!voorThuis ? <OnderBalk actief="index" /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  kop: { gap: 8, paddingHorizontal: 12, paddingBottom: 15 },
  kopRij: { flexDirection: "row", alignItems: "center", gap: 4 },
  kopTitel: { fontSize: 23, fontWeight: "800", letterSpacing: -0.5 },
  terug: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  veld: { flex: 1, height: 49, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 17, paddingVertical: 0 },
  resultaten: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24, flexGrow: 1 },
  sectiekop: { paddingHorizontal: 5, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 10 },
  sectietitel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  sectieaantal: { fontSize: 12, fontWeight: "500" },
  laden: { alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 25 },
  kaart: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 12, minHeight: 86, borderRadius: 14, borderWidth: 1, marginBottom: 10, elevation: 2, shadowColor: "#172b4d", shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  icoon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  midden: { flex: 1, minWidth: 0 },
  naam: { fontSize: 17, fontWeight: "800", lineHeight: 21, letterSpacing: -0.2 },
  plaats: { fontSize: 12, marginTop: 1 },
  sub: { fontSize: 13, marginTop: 3, fontWeight: "600" },
  rechts: { maxWidth: 120, minWidth: 44, alignItems: "flex-end", justifyContent: "center", gap: 7 },
  badges: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: 4 },
  badge: { borderRadius: 6, minWidth: 26, minHeight: 25, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  badgeTekst: { fontWeight: "800", fontSize: 11 },
  restBadge: { borderRadius: 7, minHeight: 25, paddingHorizontal: 6, justifyContent: "center" },
  restTekst: { fontWeight: "700", fontSize: 11 },
  aantal: { fontSize: 11, fontWeight: "600", textAlign: "right" }
});
