import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./LocalizedText";
import { useApp } from "../context/AppProvider";
import { liveBalkTekst, heeftActueelLive } from "../lib/ritStatus";

/** Groen = expliciet live tijdsbericht met bron-timestamp; anders grijs. */
export function LiveBalk({ live, bijgewerktMs, nu }: {
  live: boolean; bijgewerktMs: number | null; nu: number;
}) {
  const { colors, taal } = useApp();
  const isLive = heeftActueelLive(live, bijgewerktMs, nu);
  const tekst = taal === "en"
    ? isLive
      ? `Live · updated ${Math.max(0, Math.floor((nu - bijgewerktMs!) / 1000))} s ago`
      : "Timetable · no live data"
    : liveBalkTekst(isLive, bijgewerktMs, nu);
  return (
    <View style={[s.balk, { backgroundColor: colors.surface2, borderTopColor: colors.border }]}>
      <View style={[s.stip, { backgroundColor: isLive ? colors.live : colors.muted }]} />
      <Text style={[s.tekst, { color: colors.body }]}>{tekst}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  balk: { minHeight: 35, borderTopWidth: 1, paddingHorizontal: 14,
    flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 7 },
  stip: { width: 8, height: 8, borderRadius: 4 },
  tekst: { fontSize: 12, fontWeight: "600", flexShrink: 1 }
});
