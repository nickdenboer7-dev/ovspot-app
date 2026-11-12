import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./LocalizedText";
import { LijnBadge } from "./ui";
import { useApp } from "../context/AppProvider";
import type { Modus } from "../lib/types";

/** Eén compacte kop voor de ritpagina: terug, lijnbadge, bestemming en ritnummer, daarnaast kaart, ster en menu. */
export function RitKop({ lijn, modus, vervoerder, kleur, tekstkleur, bestemming, detail,
  favoriet, favorietLabel, onFavoriet, kaartIcoon, kaartLabel, kaartAan, onKaart, onMeer }: {
  lijn: string; modus: Modus; vervoerder?: string; kleur?: string; tekstkleur?: string;
  bestemming: string; detail?: string;
  favoriet: boolean; favorietLabel?: string; onFavoriet?: () => void;
  kaartIcoon: keyof typeof Ionicons.glyphMap; kaartLabel: string; kaartAan: boolean; onKaart: () => void;
  onMeer: () => void;
}) {
  const { colors, t } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.kop, { backgroundColor: colors.header, borderBottomColor: colors.border, paddingTop: insets.top + 4 }]}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        accessibilityRole="button" accessibilityLabel={t("Terug")} hitSlop={8} style={s.knop}>
        <Ionicons name="arrow-back" size={26} color={colors.headerText} />
      </Pressable>
      <LijnBadge groot lijn={lijn} modus={modus} vervoerder={vervoerder} kleur={kleur} tekstkleur={tekstkleur} />
      <View style={s.tekst}>
        <Text style={[s.naam, { color: colors.text }]} numberOfLines={2}>{bestemming}</Text>
        {detail ? <Text style={[s.detail, { color: colors.sub }]} numberOfLines={1}>{detail}</Text> : null}
      </View>
      <Pressable style={s.knop} accessibilityRole="button" accessibilityLabel={t(kaartLabel)}
        disabled={!kaartAan} onPress={onKaart}>
        <Ionicons name={kaartIcoon} size={23} color={kaartAan ? colors.accent : colors.muted} />
      </Pressable>
      {onFavoriet ? <Pressable style={s.knop} accessibilityRole="button"
        accessibilityLabel={t(favorietLabel ?? (favoriet ? "Verwijder uit favorieten" : "Bewaar als favoriet"))}
        accessibilityState={{ selected: favoriet }} onPress={onFavoriet}>
        <Ionicons name={favoriet ? "star" : "star-outline"} size={23}
          color={favoriet ? colors.star : colors.headerText} />
      </Pressable> : null}
      <Pressable style={s.knop} accessibilityRole="button" accessibilityLabel={t("Meer")} hitSlop={4} onPress={onMeer}>
        <Ionicons name="ellipsis-vertical" size={23} color={colors.headerText} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  kop: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6, paddingBottom: 8, borderBottomWidth: 1 },
  knop: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  tekst: { flex: 1, minWidth: 0, marginLeft: 4 },
  naam: { fontSize: 17, fontWeight: "800", lineHeight: 20 },
  detail: { fontSize: 12, lineHeight: 16 }
});
