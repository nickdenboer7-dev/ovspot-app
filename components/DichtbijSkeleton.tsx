import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";

/** Rustige kaart-skeletons. Geen bewegende spinner over de hele pagina. */
export function DichtbijSkeleton({ locatie }: { locatie: boolean }) {
  const { colors } = useApp();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={locatie ? "Vertrekken laden" : "Locatie bepalen"} style={s.wikkel}>
      <Text style={[s.status, { color: colors.sub }]}>
        {locatie ? "Haltes ophalen…" : "Locatie bepalen…"}
      </Text>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[s.kaart, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.boven}>
            <View style={[s.icoon, { backgroundColor: colors.surface2 }]} />
            <View style={s.tekst}>
              <View style={[s.streep, { width: i % 2 ? "55%" : "73%", backgroundColor: colors.surface2 }]} />
              <View style={[s.streepKort, { width: "37%", backgroundColor: colors.surface2 }]} />
            </View>
          </View>
          <View style={[s.vertrek, { borderTopColor: colors.divider }]}>
            <View style={[s.badge, { backgroundColor: colors.surface2 }]} />
            <View style={[s.streep, { width: "48%", backgroundColor: colors.surface2 }]} />
            <View style={[s.streep, { width: 46, backgroundColor: colors.surface2 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wikkel: { gap: 11 },
  status: { fontSize: 13, marginHorizontal: 6, marginBottom: 1 },
  kaart: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  boven: { flexDirection: "row", alignItems: "center", gap: 12 },
  icoon: { width: 42, height: 42, borderRadius: 11 },
  tekst: { flex: 1, gap: 8 },
  streep: { height: 13, borderRadius: 6 },
  streepKort: { height: 10, borderRadius: 5 },
  vertrek: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth },
  badge: { width: 45, height: 25, borderRadius: 7 }
});
