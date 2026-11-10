import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./LocalizedText";
import { useApp } from "../context/AppProvider";
import { RitStatusLabel } from "./RitStatusLabel";

/** Dezelfde statusstrook op bord en ritpagina, zonder onjuiste GPS-aannames. */
export function StatusStrook({ live, vervallen, afwijkingMin, tekst, chip, tussen }: {
  live: boolean; vervallen: boolean; afwijkingMin: number;
  tekst?: string; chip?: string; tussen?: string;
}) {
  const { colors, t } = useApp();
  return (
    <View style={[s.strook, { backgroundColor: colors.surface2, borderBottomColor: colors.border }]}>
      <View style={s.regel}>
        {tekst ? <Text style={[s.titel, { color: colors.text }]}>{t(tekst)}</Text>
          : <RitStatusLabel live={live} vervallen={vervallen} afwijkingMin={afwijkingMin} />}
        {chip ? <View style={[s.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.chipTekst, { color: colors.sub }]}>{t(chip)}</Text>
        </View> : null}
      </View>
      {tussen ? <Text style={[s.tussen, { color: colors.body }]} numberOfLines={2}>{t(tussen)}</Text> : null}
    </View>
  );
}
const s = StyleSheet.create({
  strook: { borderBottomWidth: 1, paddingVertical: 7, paddingHorizontal: 14, gap: 4, minHeight: 46 },
  regel: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  titel: { fontSize: 14, fontWeight: "700", flexShrink: 1 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  chipTekst: { fontSize: 11, fontWeight: "700" },
  tussen: { fontSize: 12, lineHeight: 17 }
});
