import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./LocalizedText";
import { useApp } from "../context/AppProvider";
import { bepaalRitStatus } from "../lib/ritStatus";
import type { RitStatusInvoer } from "../lib/ritStatus";

export function RitStatusLabel({ live, vervallen, afwijkingMin }: RitStatusInvoer) {
  const { colors, taal } = useApp();
  const st = bepaalRitStatus({ live, vervallen, afwijkingMin });
  const kleur = st.soort === "vervallen" ? colors.red
    : st.soort === "gepland" ? colors.sub
    : st.soort === "vertraagd" ? colors.red
    : st.soort === "te_vroeg" ? colors.early : colors.live;
  const tekst = taal !== "en" ? st.tekst :
    st.soort === "gepland" ? "Scheduled" :
    st.soort === "vervallen" ? "Cancelled" :
    st.soort === "op_tijd" ? "Live on time" :
    st.soort === "vertraagd" ? `Delayed +${st.afwijkingMin} min` :
    `Early ${Math.abs(st.afwijkingMin)} min`;
  return (
    <View style={s.regel}>
      <Text style={[s.tekst, { color: kleur }]}>{tekst}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  regel: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  tekst: { fontSize: 13, fontWeight: "700", flexShrink: 1 }
});
