import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppProvider";
import { isTrein, status } from "../lib/format";
import type { Modus, Vertrek } from "../lib/types";

export function LijnBadge({ lijn, modus, vervallen, groot }: { lijn: string; modus: Modus; vervallen?: boolean; groot?: boolean }) {
  const { colors } = useApp();
  const bg = vervallen ? colors.muted : isTrein(modus) ? colors.trainBadge : colors.busBadge;
  return (
    <View style={[s.badge, groot && s.badgeGroot, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, groot && s.badgeTextGroot, { color: colors.badgeText }]} numberOfLines={1}>
        {lijn}
      </Text>
    </View>
  );
}

export function LiveStip({ kleur, glow }: { kleur: string; glow?: string }) {
  return <View style={[s.stip, { backgroundColor: kleur }, glow ? { borderWidth: 3, borderColor: glow, width: 14, height: 14, borderRadius: 7 } : null]} />;
}

export function StatusLabel({ v, compact }: { v: Pick<Vertrek, "vervallen" | "live" | "vertraging_min">; compact?: boolean }) {
  const { colors } = useApp();
  const st = status(v, colors);
  if (!st.text) return null;
  return (
    <View style={s.statusRij}>
      {st.dot ? <LiveStip kleur={colors.live} /> : null}
      <Text style={[s.statusText, compact && { fontSize: 13 }, { color: st.color }]}>{st.text}</Text>
    </View>
  );
}

export function Kop({
  titel,
  sub,
  terug,
  rechts,
  groot
}: {
  titel: string;
  sub?: string;
  terug?: boolean;
  rechts?: React.ReactNode;
  groot?: boolean;
}) {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.kop, { backgroundColor: colors.header, paddingTop: insets.top + (groot ? 14 : 8) }]}>
      {terug ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          accessibilityRole="button"
          accessibilityLabel="Terug"
          hitSlop={8}
          style={s.kopKnop}
        >
          <Ionicons name="arrow-back" size={26} color={colors.headerText} />
        </Pressable>
      ) : (
        <View style={{ width: 8 }} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[groot ? s.kopTitelGroot : s.kopTitel, { color: colors.headerText }]} numberOfLines={1} accessibilityRole="header">
          {titel}
        </Text>
        {sub ? (
          <Text style={[s.kopSub, { color: colors.headerSub }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {rechts}
    </View>
  );
}

export function KopKnop({ icoon, label, onPress, kleur }: { icoon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; kleur?: string }) {
  const { colors } = useApp();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={s.kopKnop}>
      <Ionicons name={icoon} size={26} color={kleur || colors.headerText} />
    </Pressable>
  );
}

export function Chips<T extends string>({ opties, waarde, onKies }: { opties: { key: T; label: string; icoon?: keyof typeof Ionicons.glyphMap }[]; waarde: T; onKies: (k: T) => void }) {
  const { colors } = useApp();
  return (
    <View style={s.chips} accessibilityRole="tablist">
      {opties.map((o) => {
        const aan = o.key === waarde;
        return (
          <Pressable
            key={o.key}
            onPress={() => onKies(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: aan }}
            style={[s.chip, { backgroundColor: aan ? colors.accent : colors.surface2 }]}
          >
            {o.icoon ? <Ionicons name={o.icoon} size={16} color={aan ? colors.onAccent : colors.text} /> : null}
            <Text style={[s.chipText, { color: aan ? colors.onAccent : colors.text, fontWeight: aan ? "700" : "500" }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Kaart({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp();
  return <View style={[s.kaart, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function Leeg({ icoon, titel, tekst, knop }: { icoon: keyof typeof Ionicons.glyphMap; titel: string; tekst?: string; knop?: { label: string; onPress: () => void } }) {
  const { colors } = useApp();
  return (
    <View style={s.leeg}>
      <Ionicons name={icoon} size={40} color={colors.muted} />
      <Text style={[s.leegTitel, { color: colors.text }]}>{titel}</Text>
      {tekst ? <Text style={[s.leegTekst, { color: colors.sub }]}>{tekst}</Text> : null}
      {knop ? (
        <Pressable onPress={knop.onPress} style={[s.leegKnop, { backgroundColor: colors.accent }]} accessibilityRole="button">
          <Text style={[s.leegKnopText, { color: colors.onAccent }]}>{knop.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Laden() {
  const { colors } = useApp();
  return (
    <View style={s.leeg}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

export function FoutBalk({ tekst }: { tekst: string }) {
  const { colors } = useApp();
  return (
    <View style={[s.foutBalk, { backgroundColor: colors.redBg }]}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.red} />
      <Text style={[s.foutText, { color: colors.red }]}>{tekst} · probeert opnieuw</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: { minWidth: 46, height: 26, paddingHorizontal: 7, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  badgeGroot: { minWidth: 50, height: 32, borderRadius: 6 },
  badgeText: { fontSize: 14, fontWeight: "700" },
  badgeTextGroot: { fontSize: 16 },
  stip: { width: 8, height: 8, borderRadius: 4 },
  statusRij: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusText: { fontSize: 14, fontWeight: "600" },
  kop: { flexDirection: "row", alignItems: "center", paddingBottom: 12, paddingRight: 8, gap: 4 },
  kopKnop: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  kopTitel: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  kopTitelGroot: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5, paddingLeft: 8 },
  kopSub: { fontSize: 13, marginTop: 1 },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { height: 38, paddingHorizontal: 16, borderRadius: 19, flexDirection: "row", alignItems: "center", gap: 6 },
  chipText: { fontSize: 15 },
  kaart: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth * 2, overflow: "hidden" },
  leeg: { alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  leegTitel: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  leegTekst: { fontSize: 15, textAlign: "center", lineHeight: 21 },
  leegKnop: { marginTop: 6, height: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  leegKnopText: { fontSize: 15, fontWeight: "700" },
  foutBalk: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  foutText: { fontSize: 13, fontWeight: "600", flex: 1 }
});
