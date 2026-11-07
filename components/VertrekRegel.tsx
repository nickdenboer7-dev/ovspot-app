import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import { aftellen, bestemmingVoorWeergave, spoorLabel } from "../lib/format";
import { API_BASE } from "../lib/api";
import type { Vertrek } from "../lib/types";
import { LijnBadge, LiveStip, StatusLabel } from "./ui";

/**
 * Eén vertrek. compact = kaartje op Dichtbij/Favorieten (badge · bestemming · status · minuten).
 * vol = haltebord (met spoor/vervoerder eronder en geplande tijd onder de minuten).
 */
export function VertrekRegel({ v, nu, compact, eerste, onPress, diagnose = false }: { v: Vertrek; nu: number; compact?: boolean; eerste?: boolean; onPress?: () => void; diagnose?: boolean }) {
  const { colors } = useApp();
  const [tekstLayout, setTekstLayout] = React.useState("(nog niet gemeten)");
  const vertrokken = !v.vervallen && typeof v.vertrek_ms === "number" && Number.isFinite(v.vertrek_ms) && v.vertrek_ms < nu;
  const vertraagd = !v.vervallen && !vertrokken && v.vertraging_min > 0;
  const minuten = v.vervallen ? "–" : vertrokken ? "Vertrokken" : aftellen(v.vertrek_ms, nu, v.verwacht);
  const tijd = vertraagd && v.verwacht ? v.verwacht : minuten;
  const info = [spoorLabel(v.modus, v.spoor), v.vervoerder].filter(Boolean).join(" · ");
  const displayBestemming = bestemmingVoorWeergave(v.lijn, v.bestemming);
  const a11y = `${v.lijn_naam || v.lijn} naar ${displayBestemming}, ${v.vervallen ? "vervalt" : vertrokken ? "vertrokken" : tijd}${vertraagd ? `, ${v.vertraging_min} minuten vertraging, gepland ${v.gepland}` : ""}${v.spoor ? `, ${spoorLabel(v.modus, v.spoor)}` : ""}`;

  const inhoud = (
    <>
    <View
      style={[
        compact ? s.rijCompact : s.rijVol,
        vertrokken && { opacity: 0.55 },
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
            onTextLayout={diagnose ? (e) => {
              const werkelijk = e.nativeEvent.lines.map((regel) => regel.text).join(" | ");
              setTekstLayout((oud) => oud === werkelijk ? oud : werkelijk);
            } : undefined}
          >
            {displayBestemming}
          </Text>
          {v.vervallen ? (
            <View style={[s.vervaltLabel, { backgroundColor: colors.redBg }]}>
              <Text style={[s.vervaltText, { color: colors.red }]}>Vervalt</Text>
            </View>
          ) : null}
        </View>
        {(v.live || vertraagd || (!compact && info)) ? <View style={s.detailRij}>
          {!compact && info ? (
            <Text style={[s.info, { color: colors.sub }]} numberOfLines={1}>
              {info}
            </Text>
          ) : null}
          {!vertrokken && (v.live && !v.vervallen ? (
            <View style={[s.liveStatus, { backgroundColor: colors.liveGlow }]}>
              <LiveStip kleur={colors.live} />
              <Text style={[s.liveTekst, { color: vertraagd ? colors.delay : colors.live }]}>
                {vertraagd ? `+${v.vertraging_min} min` : "Live"}
              </Text>
            </View>
          ) : <StatusLabel v={v} compact />)}
        </View> : null}
      </View>
      <View style={[s.rechts, vertrokken && s.rechtsVertrokken]}>
        <Text style={[s.minuten, vertrokken && s.vertrokkenTekst, { color: v.vervallen || vertrokken ? colors.muted : vertraagd ? colors.delay : colors.text }]}>{tijd}</Text>
        {!vertrokken && vertraagd && v.gepland ? (
          <Text style={[s.gepland, { color: colors.sub, textDecorationLine: vertraagd || v.vervallen ? "line-through" : "none" }]}>{v.gepland}</Text>
        ) : null}
      </View>
    </View>
    {diagnose ? (
      <View style={s.diagnoseVlak}>
        <Text selectable style={s.diagnoseTekst}>
          {`DIAG 395 · API-veld: ${JSON.stringify(v.bestemming ?? null)}`}
          {`\nUI-tekst: ${JSON.stringify(displayBestemming ?? null)} · Lijn: ${JSON.stringify(v.lijn)}`}
          {`\nNative tekstregels: ${tekstLayout}`}
          {`\nRuwe tekens: ${Array.from(String(v.bestemming ?? "")).map((c) => c.codePointAt(0)?.toString(16)).join(" ")}`}
          {`\nRit: ${v.rit?.trip || "onbekend"} · Vertrek: ${v.gepland}`}
          {`\nBron: ${API_BASE}/halte/...`}
        </Text>
      </View>
    ) : null}
    </>
  );

  if (!onPress) return <View accessible accessibilityLabel={a11y}>{inhoud}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} android_ripple={{ color: colors.divider }}>
      {inhoud}
    </Pressable>
  );
}

const s = StyleSheet.create({
  diagnoseVlak: { paddingHorizontal: 15, paddingVertical: 8, backgroundColor: "#fef3c7", borderBottomWidth: 1, borderBottomColor: "#fcd34d" },
  diagnoseTekst: { fontSize: 12, lineHeight: 17, color: "#713f12" },
  rijCompact: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 54, paddingVertical: 7 },
  rijVol: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 76, paddingHorizontal: 15, paddingVertical: 11 },
  midden: { flex: 1, minWidth: 0, gap: 2 },
  bestemmingRij: { flexDirection: "row", alignItems: "center", gap: 8 },
  bestemming: { fontSize: 16, fontWeight: "800", flexShrink: 1, lineHeight: 21 },
  bestemmingCompact: { fontSize: 15, fontWeight: "700", flexShrink: 1, lineHeight: 20 },
  info: { fontSize: 13 },
  detailRij: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, minHeight: 18 },
  rechts: { minWidth: 61, maxWidth: 88, alignItems: "flex-end" },
  rechtsVertrokken: { minWidth: 86, maxWidth: 92 },
  minuten: { fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"], textAlign: "right" },
  vertrokkenTekst: { fontSize: 14 },
  gepland: { fontSize: 12, marginTop: 2, fontVariant: ["tabular-nums"] },
  liveStatus: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 7, minHeight: 22 },
  liveTekst: { fontSize: 13, fontWeight: "600" },
  vervaltLabel: { paddingHorizontal: 7, height: 22, borderRadius: 6, justifyContent: "center" },
  vervaltText: { fontSize: 12, fontWeight: "700" }
});
