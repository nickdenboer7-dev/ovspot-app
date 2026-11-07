import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OnderBalk } from "../components/OnderBalk";
import { Leeg } from "../components/ui";
import { useApp } from "../context/AppProvider";
import { halteIcoon, halteKleur, lijnBadgeHeeftRand, lijnKleur } from "../constants/wayfinding";
import { api } from "../lib/api";
import type { Vertrek, ZoekResultaat } from "../lib/types";
import { geldigeLijnen, maakZoekKaarten, rangschikZoekresultaten, sorteerZoekLijnen, zoekKaartSubtitel, type ZoekKaart } from "../lib/wayfindingV2";

type LijnVoorbeeld = Pick<Vertrek, "lijn" | "modus" | "vervoerder"> & { kleur?: string; tekstkleur?: string };
type Voorbeelden = Record<string, LijnVoorbeeld[]>;

/** Voorbeeldbadges komen uit echte geplande vertrekken, niet uit fictieve vaste nummers. */
function enkeleLijnen(vertrekken: Vertrek[]): LijnVoorbeeld[] {
  const uniek = new Map<string, LijnVoorbeeld>();
  for (const v of vertrekken) {
    const key = v.modus + ":" + v.lijn + ":" + v.vervoerder;
    if (!uniek.has(key)) uniek.set(key, { lijn: v.lijn, modus: v.modus, vervoerder: v.vervoerder,
      kleur: v.kleur || v.lijn_kleur, tekstkleur: v.tekstkleur || v.lijn_tekstkleur });
  }
  const alle = [...uniek.values()];
  // Gemengde stations: eerst verschillende modaliteiten, daarna de overige lijnen.
  const diverse: LijnVoorbeeld[] = [];
  const modi = new Set<string>();
  for (const x of alle) if (!modi.has(x.modus)) { diverse.push(x); modi.add(x.modus); }
  return [...diverse, ...alle.filter(x => !diverse.includes(x))].slice(0, 24);
}

function groepLabel(r: ZoekResultaat): string {
  // Oude API's bevatten nog een afgeleide `sub` met gissingen over windrichting.
  // Gebruik uitsluitend de nieuwe GTFS-omschrijving of neutrale fallback.
  return (r.omschrijving || r.plaats || r.id).trim();
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
        const gerangschikt = rangschikZoekresultaten(r.resultaten, term);
        setResultaten(gerangschikt);
        // Maximaal vier aanvullende bordqueries, pas ná de zoekresultaten.
        // Zo blijft zoeken snel en blijven de badges echte vertreklijnen.
        if (!voorThuis && term.length >= 5 && r.resultaten.length <= 8) {
          for (const item of gerangschikt.slice(0, 4)) {
            if (geldigeLijnen(item.lijnen).length) continue;
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

  const kaarten = useMemo(() => maakZoekKaarten(resultaten), [resultaten]);

  const kies = (kaart: ZoekKaart) => {
    const r = kaart.halte;
    if (voorThuis) {
      if (r.lat != null && r.lon != null) zetInstellingen({ thuis: { naam: r.naam, plaats: r.plaats, lat: r.lat, lon: r.lon } });
      router.back();
      return;
    }
    router.replace({
      pathname: "/halte/[id]",
      params: { id: r.id, van: "index", naam: r.naam, plaats: r.plaats,
        groep: kaart.gesplitst ? zoekKaartSubtitel(kaart) : groepLabel(r),
        ...(kaart.modus ? { modus: kaart.modus } : {}),
        lijnen: JSON.stringify(geldigeLijnen(r.lijnen)) }
    });
  };

  const hasResults = kaarten.length > 0;
  const meestNaam = kaarten[0]?.halte.naam;
  const relevantAantal = kaarten.filter(x => x.halte.naam === meestNaam).length;
  const overige = relevantAantal > 1 && relevantAantal < kaarten.length;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.kop, { backgroundColor: colors.header, borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
        <View style={s.kopRij}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Terug" style={s.terug} hitSlop={8}>
            <Ionicons name="arrow-back" size={26} color={colors.headerText} />
          </Pressable>
          <Text style={[s.kopTitel, { color: colors.headerText }]}>Zoeken</Text>
        </View>
        <View style={[s.veld, { backgroundColor: colors.surface2 }]}>
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
        data={kaarten}
        keyExtractor={(kaart) => kaart.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.resultaten}
        ListHeaderComponent={hasResults ? (
          <View style={s.sectiekop}>
            <Text style={[s.sectietitel, { color: colors.sub }]}>{overige ? "MEEST RELEVANT" : "ZOEKRESULTATEN"}</Text>
            <Text style={[s.sectieaantal, { color: colors.sub }]}>
              {kaarten.length} {kaarten.length === 1 ? "resultaat" : "resultaten"}
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
        renderItem={({ item: kaart, index }) => {
          const item = kaart.halte;
          // Gesplitste kaarten bevatten alleen lijnbadges van hun eigen modus.
          const lijst = kaart.lijnen.length ? kaart.lijnen
            : sorteerZoekLijnen(voorbeelden[item.id] || []).filter(x => !kaart.modus || x.modus === kaart.modus);
          const vervoerder = lijst.find(x => x.vervoerder)?.vervoerder;
          const palet = halteKleur(kaart.modus ? [kaart.modus] : item.modi, vervoerder);
          const icoonModus = kaart.modus || item.modi[0];
          const icon = kaart.gesplitst ? (
            icoonModus === "train" ? "train-outline" : icoonModus === "metro" ? "subway-outline"
              : icoonModus === "ferry" ? "boat-outline" : "bus-outline"
          ) : halteIcoon(item.modi);
          const sub = kaart.gesplitst ? zoekKaartSubtitel(kaart) : groepLabel(item);
          return (
            <View>
              {overige && index === relevantAantal ? (
                <Text style={[s.sectietitel, s.tussenkop, { color: colors.sub }]}>ANDERE RESULTATEN</Text>
              ) : null}
              <Pressable
                onPress={() => kies(kaart)}
                style={[s.kaart, { backgroundColor: colors.surface, borderColor: colors.border }]}
                android_ripple={{ color: colors.divider }}
                accessibilityRole="button"
                accessibilityLabel={`${item.naam}, ${sub}, ${lijst.length || item.lijnen_aantal || 0} lijnen`}
              >
                <View style={s.bovenRij}>
                  <View style={[s.icoon, { backgroundColor: palet.bg }]}>
                    {kaart.modus === "tram" ? (
                      <MaterialCommunityIcons name="tram" size={25} color={palet.fg} />
                    ) : (
                      <Ionicons name={icon} size={24} color={palet.fg} />
                    )}
                  </View>
                  <View style={s.midden}>
                    <Text style={[s.naam, { color: colors.text }]} numberOfLines={1}>{item.naam}</Text>
                    {!kaart.gesplitst && !!item.plaats && (
                      <Text style={[s.plaats, { color: colors.sub }]} numberOfLines={1}>{item.plaats}</Text>
                    )}
                    <Text style={[s.sub, { color: colors.sub }]} numberOfLines={2}>{sub}</Text>
                  </View>
                  <Ionicons name={voorThuis ? "home-outline" : "chevron-forward"} size={18} color={colors.sub} />
                </View>
                {lijst.length > 0 ? (
                  <View style={s.badges}>
                    {lijst.map(x => {
                      const k = lijnKleur(x.lijn, x.modus, x.vervoerder, x.kleur, x.tekstkleur);
                      return (
                        <View key={`${x.modus}:${x.lijn}:${x.vervoerder}`} style={[s.badge, { backgroundColor: k.bg }, lijnBadgeHeeftRand(k) && { borderWidth: 1, borderColor: "#CBD5E1" }]}>
                          <Text style={[s.badgeTekst, { color: k.fg }]} numberOfLines={1}>{x.lijn}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={[s.aantal, { color: colors.sub }]}>{item.lijnen_aantal ? `${item.lijnen_aantal} ${item.lijnen_aantal === 1 ? "lijn" : "lijnen"}` : ""}</Text>
                )}
              </Pressable>
            </View>
          );
        }}
      />
      {!voorThuis ? <OnderBalk actief="index" /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  kop: { gap: 8, paddingHorizontal: 16, paddingBottom: 15, borderBottomWidth: 1 },
  kopRij: { flexDirection: "row", alignItems: "center", gap: 4 },
  kopTitel: { fontSize: 23, fontWeight: "800", letterSpacing: -0.5 },
  terug: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  veld: { width: "100%", height: 49, flexShrink: 0, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 17, paddingVertical: 0 },
  resultaten: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24, flexGrow: 1 },
  sectiekop: { paddingHorizontal: 5, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 10 },
  sectietitel: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  sectieaantal: { fontSize: 12, fontWeight: "500" },
  tussenkop: { marginHorizontal: 5, marginTop: 15, marginBottom: 10 },
  laden: { alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 25 },
  kaart: { gap: 11, paddingHorizontal: 14, paddingVertical: 14, minHeight: 86, borderRadius: 18, borderWidth: 1, marginBottom: 10 },
  bovenRij: { flexDirection: "row", alignItems: "center", gap: 11 },
  icoon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  midden: { flex: 1, minWidth: 0 },
  naam: { fontSize: 17, fontWeight: "800", lineHeight: 21, letterSpacing: -0.2 },
  plaats: { fontSize: 12, marginTop: 1 },
  sub: { fontSize: 13, marginTop: 3, fontWeight: "600" },
  badges: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-start", gap: 5, width: "100%", paddingTop: 2 },
  badge: { borderRadius: 8, minWidth: 26, minHeight: 25, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  badgeTekst: { fontWeight: "800", fontSize: 11 },
  aantal: { fontSize: 11, fontWeight: "600", textAlign: "right" }
});
