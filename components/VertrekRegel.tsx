import React from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "./LocalizedText";
import { useApp } from "../context/AppProvider";
import { bestemmingVoorWeergave, spoorLabel, vertrekTijden } from "../lib/format";
import type { Vertrek } from "../lib/types";
import { LijnBadge } from "./ui";
import { RitTijdcel } from "./RitTijdcel";
import { RitStatusLabel } from "./RitStatusLabel";
import { bepaalRitStatus } from "../lib/ritStatus";

/**
 * Eén vertrek. compact = kaartje op Dichtbij/Favorieten (badge · bestemming · status · minuten).
 * vol = haltebord (met spoor/vervoerder eronder en geplande tijd onder de minuten).
 */
export function VertrekRegel({ v, nu, compact, eerste, onPress }: { v: Vertrek; nu: number; compact?: boolean; eerste?: boolean; onPress?: () => void }) {
  const { colors, t, instellingen } = useApp();
  const { width, fontScale } = useWindowDimensions();
  const smalScherm = width < 380 || fontScale > 1.2 || instellingen.groteTekst;
  const { vertrokken, vertraagd, tijd, kloktijd, tweedeTijd, oorspronkelijk } = vertrekTijden(v, nu);
  const statusRit = bepaalRitStatus({
    live: v.live, vervallen: v.vervallen, afwijkingMin: v.vertraging_min
  });
  const info = [spoorLabel(v.modus, v.spoor), v.vervoerder].filter(Boolean).join(" · ");
  const displayBestemming = bestemmingVoorWeergave(v.lijn, v.bestemming);
  // Screen readers receive translated labels without altering operator destinations.
  const a11y = [
    `${v.lijn_naam || v.lijn} ${t("naar")} ${displayBestemming}`,
    v.vervallen ? t("Vervalt") : vertrokken ? t("Vertrokken") : t(tijd),
    kloktijd ? `${t("vertrek")} ${kloktijd}` : "",
    t(statusRit.tekst),
    vertraagd ? `${v.vertraging_min} ${t("minuten vertraging")}` : "",
    oorspronkelijk ? `${t("oorspronkelijk")} ${oorspronkelijk}` : "",
    v.spoor ? t(spoorLabel(v.modus, v.spoor)) : ""
  ].filter(Boolean).join(", ");

  const inhoud = (
    <View
      style={[
        compact ? s.rijCompact : s.rijVol,
        smalScherm && (compact ? s.rijCompactSmal : s.rijVolSmal),
        vertrokken && { opacity: 0.55 },
        { borderTopColor: colors.divider, borderTopWidth: compact && !eerste ? StyleSheet.hairlineWidth * 2 : 0 },
        !compact && { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth * 2 }
      ]}
    >
      <LijnBadge
        lijn={v.lijn} modus={v.modus} vervoerder={v.vervoerder}
        kleur={v.kleur || v.lijn_kleur} tekstkleur={v.tekstkleur || v.lijn_tekstkleur}
        vervallen={v.vervallen}
      />
      <View style={s.midden}>
        <View style={s.bestemmingRij}>
          <Text
            style={[
              compact ? s.bestemmingCompact : s.bestemming,
              { color: v.vervallen ? colors.muted : colors.text, textDecorationLine: v.vervallen ? "line-through" : "none" }
            ]}
          >
            {displayBestemming}
          </Text>
        </View>
        {((!compact && info) || (!vertrokken && !v.vervallen)) ? <View style={s.detailRij}>
          {!compact && info ? (
            <Text style={[s.info, { color: colors.sub }]} numberOfLines={1}>
              {info}
            </Text>
          ) : null}
          {!vertrokken ? (
            <RitStatusLabel live={v.live} vervallen={v.vervallen} afwijkingMin={v.vertraging_min} />
          ) : null}
        </View> : null}
      </View>
      <View style={[s.rechts, smalScherm && s.rechtsSmal, vertrokken && s.rechtsVertrokken]}>
        {vertrokken && !v.vervallen ? (
          <Text style={[s.vertrokkenTekst, { color: colors.muted }]}>Vertrokken</Text>
        ) : (
          <RitTijdcel
            verwacht={kloktijd} gepland={v.gepland}
            live={v.live} vervallen={v.vervallen} afwijkingMin={v.vertraging_min}
            aftel={!v.vervallen && tijd !== kloktijd ? tijd : undefined}
          />
        )}
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
  rijCompact: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 54, paddingVertical: 7 },
  rijCompactSmal: { gap: 6 },
  rijVol: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 76, paddingHorizontal: 15, paddingVertical: 11 },
  rijVolSmal: { gap: 7, paddingHorizontal: 10 },
  midden: { flex: 1, minWidth: 0, gap: 2 },
  bestemmingRij: { flexDirection: "row", alignItems: "center", gap: 8 },
  bestemming: { fontSize: 16, fontWeight: "800", flexShrink: 1, lineHeight: 21 },
  bestemmingCompact: { fontSize: 15, fontWeight: "700", flexShrink: 1, lineHeight: 20 },
  info: { fontSize: 13 },
  detailRij: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, minHeight: 18 },
  rechts: { minWidth: 76, maxWidth: 100, flexShrink: 0, alignItems: "flex-end" },
  rechtsSmal: { minWidth: 68, maxWidth: 78 },
  rechtsVertrokken: { minWidth: 76, maxWidth: 100 },
  minuten: { fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"], textAlign: "right" },
  minutenSmal: { fontSize: 15 },
  vertrokkenTekst: { fontSize: 13 },
  kloktijd: { fontSize: 12, marginTop: 2, fontVariant: ["tabular-nums"], textAlign: "right" },
  gepland: { fontSize: 11, marginTop: 2, fontVariant: ["tabular-nums"], textAlign: "right" },
  liveStatus: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 7, minHeight: 22 },
  liveTekst: { fontSize: 13, fontWeight: "600" },
  vervaltLabel: { paddingHorizontal: 7, height: 22, borderRadius: 6, justifyContent: "center" },
  vervaltText: { fontSize: 12, fontWeight: "700" }
});
