import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./LocalizedText";
import { useApp } from "../context/AppProvider";
import type { RitInfoRij } from "../lib/ritverloopV2";

/** Aparte kaart met ritgegevens: label links, waarde rechts, niets wordt afgekapt. */
export function RitInfoKaart({ rijen }: { rijen: RitInfoRij[] }) {
  const { colors, t } = useApp();
  if (!rijen.length) return null;
  return (
    <View style={[s.kaart, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[s.kop, { color: colors.text }]}>{t("Ritinformatie")}</Text>
      {rijen.map((r, i) => (
        <View key={r.label} style={[s.rij, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <Text style={[s.label, { color: colors.sub }]}>{t(r.label)}</Text>
          <Text style={[s.waarde, { color: colors.text }]}>{r.waarde}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  kaart: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, marginTop: 12 },
  kop: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  rij: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 9, gap: 16 },
  label: { fontSize: 14, fontWeight: "600", flexShrink: 0 },
  waarde: { fontSize: 14, fontWeight: "700", flex: 1, textAlign: "right" }
});
