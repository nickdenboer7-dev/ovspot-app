import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./LocalizedText";
import { useApp } from "../context/AppProvider";
import { LijnBadge } from "./ui";
import type { Modus } from "../lib/types";

/** Eén blauwe appbalk voor het haltebord en de ritpagina. */
export function OVspotSchermKop({ favoriet, onFavoriet, favorietLabel, meer }: {
  favoriet: boolean; onFavoriet?: () => void; favorietLabel?: string; meer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useApp();
  return (
    <View style={[s.balk, { paddingTop: insets.top + 3 }]}>
      <Pressable style={s.kopKnop} accessibilityRole="button" accessibilityLabel={t("Terug")}
        onPress={() => router.canGoBack() ? router.back() : router.replace("/")}>
        <Ionicons name="arrow-back" size={25} color="#FFFFFF" />
      </Pressable>
      <Text style={s.titel} accessibilityRole="header">OVspot</Text>
      {onFavoriet ? <Pressable style={s.kopKnop} accessibilityRole="button"
        accessibilityLabel={t(favorietLabel ?? (favoriet ? "Verwijder uit favorieten" : "Bewaar als favoriet"))}
        accessibilityState={{ selected: favoriet }}
        onPress={onFavoriet}>
        <Ionicons name={favoriet ? "star" : "star-outline"} size={25}
          color={favoriet ? "#FCD34D" : "#FFFFFF"} />
      </Pressable> : null}
      {meer}
    </View>
  );
}

/** Identiteitsrij van dezelfde schermfamilie; badges komen via de bestaande
 * LijnBadge -> lijnKleur uit de operator-/routepaletregel van het haltebord.
 */
export function OVspotIdentiteit({ naam, detail, lijn, modus, vervoerder, kleur, tekstkleur, actie }: {
  naam: string; detail?: string; lijn?: string; modus?: Modus; vervoerder?: string;
  kleur?: string; tekstkleur?: string; actie?: React.ReactNode;
}) {
  const { colors, t } = useApp();
  const isRit = !!lijn;
  return (
    <View style={[s.identiteit, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      {isRit ? (
        <LijnBadge groot lijn={lijn!} modus={modus || "bus"} vervoerder={vervoerder}
          kleur={kleur} tekstkleur={tekstkleur} />
      ) : null}
      <View style={s.identiteitTekst}>
        <Text style={[s.naam, { color: colors.text }]} numberOfLines={2}>
          {isRit ? `${t("naar")} ${naam}` : naam}
        </Text>
        {detail ? <Text style={[s.detail, { color: colors.sub }]} numberOfLines={2}>{detail}</Text> : null}
      </View>
      {actie}
    </View>
  );
}
const s = StyleSheet.create({
  balk: { backgroundColor: "#0A3A7A", minHeight: 60, paddingBottom: 4, paddingHorizontal: 6,
    flexDirection: "row", alignItems: "center" },
  kopKnop: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  titel: { flex: 1, fontSize: 20, fontWeight: "800", color: "#FFFFFF", paddingLeft: 10 },
  identiteit: { minHeight: 68, flexDirection: "row", gap: 11, alignItems: "center",
    borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  identiteitTekst: { flex: 1, minWidth: 0, gap: 3 },
  naam: { fontSize: 18, fontWeight: "800", lineHeight: 23, flexShrink: 1 },
  detail: { fontSize: 12, lineHeight: 17 }
});
