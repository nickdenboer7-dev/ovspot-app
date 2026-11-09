import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../components/LocalizedText";
import { HalteKaart } from "../../components/HalteKaart";
import { Kaart, Kop, Leeg } from "../../components/ui";
import { useApp } from "../../context/AppProvider";
import { api } from "../../lib/api";
import { useNu, usePolling } from "../../lib/hooks";
import type { FavHalte } from "../../lib/types";

function FavKaart({ f, nu }: { f: FavHalte; nu: number }) {
  const { instellingen } = useApp();
  const poll = usePolling(`fav:${f.id}`, () => api.halte(f.id, "alles", 3),
    instellingen.databesparing ? 60_000 : 20_000);
  const titel = f.plaats && !f.naam.startsWith("Station") ? `${f.plaats}, ${f.naam}` : f.naam;
  return (
    <HalteKaart
      id={f.id}
      naam={titel}
      plaats={f.plaats}
      modi={poll.data?.modi}
      vertrekken={(poll.data?.vertrekken ?? []).slice(0, 3)}
      storingen={poll.data?.storingen.length ?? 0}
      fout={poll.data ? null : poll.fout}
      laden={poll.laden && !poll.data}
      nu={nu}
      van="favorieten"
      ster
    />
  );
}

export default function Favorieten() {
  const { colors, favorieten, verwijderFavoriet, verplaatsFavoriet, t } = useApp();
  const [bewerk, setBewerk] = useState(false);
  const nu = useNu(10_000);
  const plaatsen = [...new Set(favorieten.map((f) => f.plaats).filter(Boolean))];
  const locatieLabel = plaatsen.length === 1 ? plaatsen[0] : `${favorieten.length} haltes`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Kop
        groot
        titel="Favorieten"
        rechts={
          favorieten.length ? (
            <Pressable onPress={() => setBewerk((b) => !b)} accessibilityRole="button" style={s.bewerk} hitSlop={6}>
              <Text style={[s.bewerkText, { color: colors.accent }]}>{bewerk ? "Klaar" : "Bewerk"}</Text>
            </Pressable>
          ) : null
        }
      />
      <View style={[s.zoekStrook, { backgroundColor: colors.header, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.push("/zoek")} accessibilityRole="search" accessibilityLabel={t("Zoek een halte")}
          style={[s.zoekbalk, { backgroundColor: colors.surface2 }]}>
          <Ionicons name="search-outline" size={20} color={colors.sub} />
          <Text style={[s.zoekText, { color: colors.sub }]}>Zoek halte om toe te voegen</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={s.lijst}>
        {favorieten.length ? (
          <View style={s.metaRij}>
            <Text style={[s.metaTitel, { color: colors.text }]}>Mijn haltes</Text>
            <View style={[s.locatieChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="location-sharp" size={12} color={colors.accent} />
              <Text style={[s.locatieTekst, { color: colors.sub }]} numberOfLines={1}>{locatieLabel}</Text>
            </View>
          </View>
        ) : null}
        {!favorieten.length ? (
          <Leeg
            icoon="star-outline"
            titel="Nog geen favorieten"
            tekst="Tik op de ster bij een halte om hem hier te bewaren."
            knop={{ label: "Zoek een halte", onPress: () => router.push("/zoek") }}
          />
        ) : bewerk ? (
          <Kaart>
            {favorieten.map((f, i) => (
              <View key={f.id} style={[s.bewerkRij, { borderTopColor: colors.divider, borderTopWidth: i ? StyleSheet.hairlineWidth * 2 : 0 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.bewerkNaam, { color: colors.text }]} numberOfLines={1}>
                    {f.naam}
                  </Text>
                  {f.plaats ? <Text style={{ color: colors.sub, fontSize: 13 }}>{f.plaats}</Text> : null}
                </View>
                <Pressable onPress={() => verplaatsFavoriet(f.id, -1)} disabled={i === 0} style={s.icoKnop} accessibilityLabel={`${f.naam} omhoog`}>
                  <Ionicons name="chevron-up" size={22} color={i === 0 ? colors.border : colors.text} />
                </Pressable>
                <Pressable onPress={() => verplaatsFavoriet(f.id, 1)} disabled={i === favorieten.length - 1} style={s.icoKnop} accessibilityLabel={`${f.naam} omlaag`}>
                  <Ionicons name="chevron-down" size={22} color={i === favorieten.length - 1 ? colors.border : colors.text} />
                </Pressable>
                <Pressable onPress={() => verwijderFavoriet(f.id)} style={s.icoKnop} accessibilityLabel={`${f.naam} verwijderen`}>
                  <Ionicons name="trash-outline" size={22} color={colors.red} />
                </Pressable>
              </View>
            ))}
          </Kaart>
        ) : (
          favorieten.map((f) => <FavKaart key={f.id} f={f} nu={nu} />)
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  lijst: { padding: 14, paddingTop: 17, gap: 12, paddingBottom: 26 },
  zoekStrook: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  zoekbalk: { height: 49, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 15 },
  zoekText: { fontSize: 15 },
  metaRij: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 1 },
  metaTitel: { fontSize: 18, fontWeight: "700" },
  locatieChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, maxWidth: "54%" },
  locatieTekst: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  bewerk: { height: 44, justifyContent: "center", paddingHorizontal: 10, borderRadius: 12 },
  bewerkText: { fontSize: 16, fontWeight: "600" },
  bewerkRij: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 16, paddingRight: 6, minHeight: 60 },
  bewerkNaam: { fontSize: 16, fontWeight: "600" },
  icoKnop: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }
});
