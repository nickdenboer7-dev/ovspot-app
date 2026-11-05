import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { HalteKaart } from "../../components/HalteKaart";
import { Kaart, Kop, Leeg } from "../../components/ui";
import { useApp } from "../../context/AppProvider";
import { api } from "../../lib/api";
import { useNu, usePolling } from "../../lib/hooks";
import type { FavHalte } from "../../lib/types";

function FavKaart({ f, nu }: { f: FavHalte; nu: number }) {
  const poll = usePolling(`fav:${f.id}`, () => api.halte(f.id, "alles", 3), 20_000);
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
  const { colors, favorieten, verwijderFavoriet, verplaatsFavoriet } = useApp();
  const [bewerk, setBewerk] = useState(false);
  const nu = useNu(10_000);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Kop
        groot
        titel="Favorieten"
        rechts={
          favorieten.length ? (
            <Pressable onPress={() => setBewerk((b) => !b)} accessibilityRole="button" style={s.bewerk} hitSlop={6}>
              <Text style={[s.bewerkText, { color: colors.headerText }]}>{bewerk ? "Klaar" : "Bewerk"}</Text>
            </Pressable>
          ) : null
        }
      />
      <ScrollView contentContainerStyle={s.lijst}>
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
  lijst: { padding: 12, gap: 12, paddingBottom: 24 },
  bewerk: { height: 44, justifyContent: "center", paddingHorizontal: 10 },
  bewerkText: { fontSize: 16, fontWeight: "600" },
  bewerkRij: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 16, paddingRight: 6, minHeight: 60 },
  bewerkNaam: { fontSize: 16, fontWeight: "600" },
  icoKnop: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }
});
