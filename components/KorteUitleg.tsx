import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./LocalizedText";
import { useApp } from "../context/AppProvider";

/** In-line, optional help. No modal, no location permissions, no network requests. */
const ITEMS = [
  { icon: "time-outline", title: "Nu", description: "Het vertrek is nu of binnen ongeveer 30 seconden." },
  { icon: "radio-outline", title: "Live", description: "De tijd is bijgewerkt met actuele OV-gegevens." },
  { icon: "timer-outline", title: "+3 min", description: "De rit is 3 minuten later dan gepland." },
  { icon: "locate-outline", title: "GPS-status", description: "Actueel geeft een bevestigde positie aan; verouderd of onzeker niet." },
  { icon: "star-outline", title: "Favorieten", description: "Tik op de ster bij een halte om die snel terug te vinden." }
] as const;

export function KorteUitleg({ onSluit }: { onSluit: () => void }) {
  const { colors, t } = useApp();
  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.head}>
        <View style={s.headText}>
          <Text style={[s.title, { color: colors.text }]} accessibilityRole="header">
            OVspot in het kort
          </Text>
          <Text style={[s.intro, { color: colors.sub }]}>
            Vijf symbolen die je helpen met vertrekken en ritten.
          </Text>
        </View>
        <Pressable onPress={onSluit} accessibilityRole="button"
          accessibilityLabel={t("Uitleg sluiten")} hitSlop={9} style={s.close}>
          <Ionicons name="close" size={21} color={colors.sub} />
        </Pressable>
      </View>
      <View style={s.items}>
        {ITEMS.map(item => (
          <View key={item.title} style={s.item}>
            <View style={[s.iconBox, { backgroundColor: colors.surface2 }]}>
              <Ionicons name={item.icon} size={17} color={colors.accent} />
            </View>
            <View style={s.itemText}>
              <Text style={[s.itemTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[s.itemDescription, { color: colors.body }]}>{item.description}</Text>
            </View>
          </View>
        ))}
      </View>
      <Pressable onPress={onSluit} accessibilityRole="button"
        accessibilityLabel={t("Begrepen")} style={[s.done, { backgroundColor: colors.accent }]}>
        <Text style={[s.doneText, { color: colors.onAccent }]}>Begrepen</Text>
        <Ionicons name="checkmark" size={17} color={colors.onAccent} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 13 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  headText: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 17, fontWeight: "800" },
  intro: { fontSize: 12, lineHeight: 17 },
  close: { width: 33, height: 33, justifyContent: "center", alignItems: "center" },
  items: { gap: 10 },
  item: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  itemText: { flex: 1, minWidth: 0, gap: 1 },
  itemTitle: { fontSize: 14, fontWeight: "700" },
  itemDescription: { fontSize: 12, lineHeight: 17 },
  done: { minHeight: 42, paddingHorizontal: 14, borderRadius: 11,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  doneText: { fontSize: 14, fontWeight: "700" }
});