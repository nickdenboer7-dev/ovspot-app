import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Leeg } from "../components/ui";
import { useApp } from "../context/AppProvider";
import { api } from "../lib/api";
import type { ZoekResultaat } from "../lib/types";

export default function Zoek() {
  const { colors, zetInstellingen } = useApp();
  const { doel } = useLocalSearchParams<{ doel?: string }>();
  const voorThuis = doel === "thuis";
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [resultaten, setResultaten] = useState<ZoekResultaat[]>([]);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const volgnr = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResultaten([]);
      setFout(null);
      return;
    }
    const mijn = ++volgnr.current;
    const t = setTimeout(async () => {
      setBezig(true);
      try {
        const r = await api.zoek(term);
        if (mijn === volgnr.current) {
          setResultaten(r.resultaten);
          setFout(null);
        }
      } catch (e: any) {
        if (mijn === volgnr.current) setFout(e?.message || "Zoeken lukt nu niet");
      } finally {
        if (mijn === volgnr.current) setBezig(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  const kies = (r: ZoekResultaat) => {
    if (voorThuis) {
      if (r.lat != null && r.lon != null) zetInstellingen({ thuis: { naam: r.naam, plaats: r.plaats, lat: r.lat, lon: r.lon } });
      router.back();
      return;
    }
    router.replace({ pathname: "/halte/[id]", params: { id: r.id, van: "index", naam: r.naam, plaats: r.plaats } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.kop, { backgroundColor: colors.header, paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Terug" style={s.terug} hitSlop={8}>
          <Ionicons name="arrow-back" size={26} color={colors.headerText} />
        </Pressable>
        <View style={[s.veld, { backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={20} color={colors.sub} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            placeholder={voorThuis ? "Zoek je thuishalte" : "Zoek halte, lijn of plaats"}
            placeholderTextColor={colors.muted}
            style={[s.input, { color: colors.text }]}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Zoekterm"
          />
          {bezig ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          {q && !bezig ? (
            <Pressable onPress={() => setQ("")} accessibilityLabel="Wissen" hitSlop={10}>
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <FlatList
        data={resultaten}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingVertical: 8 }}
        ListEmptyComponent={
          q.trim().length < 2 ? (
            <Leeg icoon="search-outline" titel={voorThuis ? "Kies je thuislocatie" : "Zoek een halte"} tekst="Typ minimaal 2 letters, bijvoorbeeld een straat, station of plaats." />
          ) : fout ? (
            <Leeg icoon="cloud-offline-outline" titel="Zoeken lukt nu niet" tekst={fout} />
          ) : !bezig ? (
            <Leeg icoon="help-circle-outline" titel="Niets gevonden" tekst={`Geen haltes voor "${q.trim()}". Probeer de plaatsnaam erbij, bijvoorbeeld "Leeuwarden Zaailand".`} />
          ) : null
        }
        renderItem={({ item }) => {
          const trein = item.modi.includes("train");
          return (
            <Pressable onPress={() => kies(item)} style={[s.rij, { borderBottomColor: colors.divider }]} android_ripple={{ color: colors.divider }} accessibilityRole="button">
              <View style={[s.icoon, { backgroundColor: colors.surface2 }]}>
                <Ionicons name={trein ? "train-outline" : "bus-outline"} size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.naam, { color: colors.text }]} numberOfLines={1}>
                  {item.naam}
                </Text>
                <Text style={[s.sub, { color: colors.sub }]} numberOfLines={1}>
                  {[item.plaats, item.lijnen_aantal ? `${item.lijnen_aantal} lijnen` : ""].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Ionicons name={voorThuis ? "home-outline" : "chevron-forward"} size={20} color={colors.sub} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  kop: { flexDirection: "row", alignItems: "center", gap: 4, paddingBottom: 12, paddingRight: 12 },
  terug: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  veld: { flex: 1, height: 48, borderRadius: 24, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 },
  input: { flex: 1, fontSize: 17, paddingVertical: 0 },
  rij: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth * 2 },
  icoon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  naam: { fontSize: 16, fontWeight: "700" },
  sub: { fontSize: 13, marginTop: 1 }
});
