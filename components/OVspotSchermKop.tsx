import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./LocalizedText";
import { useApp } from "../context/AppProvider";
import { Kop, LijnBadge } from "./ui";
import type { Modus } from "../lib/types";

/** Dezelfde themagevoelige schermkop als Dichtbij, Favorieten en Instellingen. */
export function OVspotSchermKop({ titel = "Haltebord", favoriet, onFavoriet, favorietLabel, meer }: {
  titel?: string; favoriet: boolean; onFavoriet?: () => void;
  favorietLabel?: string; meer?: React.ReactNode;
}) {
  const { colors, t } = useApp();
  return (
    <Kop groot terug titel={titel} rechts={
      <View style={s.acties}>
        {onFavoriet ? <Pressable style={s.kopKnop} accessibilityRole="button"
          accessibilityLabel={t(favorietLabel ?? (favoriet ? "Verwijder uit favorieten" : "Bewaar als favoriet"))}
          accessibilityState={{ selected: favoriet }} onPress={onFavoriet}>
          <Ionicons name={favoriet ? "star" : "star-outline"} size={24}
            color={favoriet ? colors.star : colors.headerText} />
        </Pressable> : null}
        {meer}
      </View>
    } />
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
    <View style={[s.identiteit, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
  acties: { flexDirection: "row", alignItems: "center", gap: 2 },
  kopKnop: { width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center" },
  identiteit: { minHeight: 68, flexDirection: "row", gap: 11, alignItems: "center",
    borderWidth: 1, borderRadius: 18, marginHorizontal: 14, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 12 },
  identiteitTekst: { flex: 1, minWidth: 0, gap: 3 },
  naam: { fontSize: 18, fontWeight: "700", lineHeight: 24, flexShrink: 1 },
  detail: { fontSize: 12, lineHeight: 17 }
});
