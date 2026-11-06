import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import { aftellen, spoorLabel } from "../lib/format";
import type { Vertrek } from "../lib/types";
import { LijnBadge, StatusLabel } from "./ui";

/**
 * Eén vertrek. compact = kaartje op Dichtbij/Favorieten (badge · bestemming · status · minuten).
 * vol = haltebord (met spoor/vervoerder eronder en geplande tijd onder de minuten).
 */
export function VertrekRegel({ v, nu, compact, eerste, onPress }: { v: Vertrek; nu: number; compact?: boolean; eerste?: boolean; onPress?: () => void }) {
  const { colors } = useApp();
  const minuten = v.vervallen ? "–" : aftellen(v.vertrek_ms, nu, v.verwacht);
  const info = [spoorLabel(v.modus, v.spoor), v.vervoerder].filter(Boolean).join(" · ");
  const a11y = `${v.lijn_naam || v.lijn} naar ${v.bestemming}, ${v.vervallen ? "vervalt" : minuten}${v.vertraging_min > 0 ? `, ${v.vertraging_min} minuten vertraging` : ""}${v.spoor ? `, ${spoorLabel(v.modus, v.spoor)}` : ""}`;

  const inhoud = (
    <View
      style={[
        compact ? s.rijCompact : s.rijVol,
        { borderTopColor: colors.divider, borderTopWidth: compact && !eerste ? StyleSheet.hairlineWidth * 2 : 0 },
        !compact && { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth * 2 }
      ]}
    >
      <LijnBadge lijn={v.lijn} modus={v.modus} vervoerder={v.vervoerder} vervallen={v.vervallen} />
      <View style={s.midden}>
        <View style={s.bestemmingRij}>
          <Text
            style={[
              compact ? s.bestemmingCompact : s.bestemming,
              { color: v.vervallen ? colors.muted : colors.text, textDecorationLine: v.vervallen ? "line-through" : "none" }
            ]}
            numberOfLines={2}
          >
            {v.bestemming}
          </Text>
          {v.vervallen ? (
            <View style={[s.vervaltLabel, { backgroundColor: colors.redBg }]}>
              <Text style={[s.vervaltText, { color: colors.red }]}>Vervalt</Text>
            </View>
          ) : null}
        </View>
        <View style={s.detailRij}>
          {!compact && info ? (
            <Text style={[s.info, { color: colors.sub }]} numberOfLines={1}>
              {info}
            </Text>
          ) : null}
          <StatusLabel v={v} compact />
        </View>
      </View>
      <View style={s.rechts}>
        <Text style={[s.minuten, { color: v.vervallen ? colors.muted : colors.text }]}>{minuten}</Text>
        {!compact && v.gepland !== minuten ? (
          <Text style={[s.gepland, { color: colors.sub, textDecorationLine: v.vervallen ? "line-through" : "none" }]}>{v.gepland}</Text>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return <View accessible accessibilityLabel={a11y}>{inhoud}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} android_ripple={{ color: colors.divider }}>
      {inhoud}
    </Pressable>
  );
}

const s = StyleSheet.create({
  rijCompact: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingVertical: 5 },
  rijVol: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 78, paddingHorizontal: 12, paddingVertical: 11 },
  midden: { flex: 1, minWidth: 0, gap: 2 },
  bestemmingRij: { flexDirection: "row", alignItems: "center", gap: 8 },
  bestemming: { fontSize: 16, fontWeight: "800", flexShrink: 1, lineHeight: 21 },
  bestemmingCompact: { fontSize: 16, flexShrink: 1, lineHeight: 20 },
  info: { fontSize: 13 },
  detailRij: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, minHeight: 18 },
  rechts: { minWidth: 54, maxWidth: 67, alignItems: "flex-end" },
  minuten: { fontSize: 17, fontWeight: "800" },
  gepland: { fontSize: 12, marginTop: 1 },
  vervaltLabel: { paddingHorizontal: 7, height: 22, borderRadius: 6, justifyContent: "center" },
  vervaltText: { fontSize: 12, fontWeight: "700" }
});
