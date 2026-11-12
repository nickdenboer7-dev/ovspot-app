import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./LocalizedText";
import { useApp } from "../context/AppProvider";

/** Compacte kop voor het haltebord: terug, haltenaam met plaats eronder, ster. Zelfde opzet als RitKop. */
export function HalteKop({ naam, detail, favoriet, onFavoriet }: {
  naam: string; detail?: string; favoriet: boolean; onFavoriet?: () => void;
}) {
  const { colors, t } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.kop, { backgroundColor: colors.header, borderBottomColor: colors.border, paddingTop: insets.top + 4 }]}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        accessibilityRole="button" accessibilityLabel={t("Terug")} hitSlop={8} style={s.knop}>
        <Ionicons name="arrow-back" size={26} color={colors.headerText} />
      </Pressable>
      <View style={s.tekst}>
        <Text accessibilityRole="header" style={[s.naam, { color: colors.text }]} numberOfLines={2}>{naam}</Text>
        {detail ? <Text style={[s.detail, { color: colors.sub }]} numberOfLines={1}>{detail}</Text> : null}
      </View>
      {onFavoriet ? <Pressable style={s.knop} accessibilityRole="button"
        accessibilityLabel={t(favoriet ? "Verwijder uit favorieten" : "Bewaar als favoriet")}
        accessibilityState={{ selected: favoriet }} onPress={onFavoriet}>
        <Ionicons name={favoriet ? "star" : "star-outline"} size={23}
          color={favoriet ? colors.star : colors.headerText} />
      </Pressable> : null}
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
