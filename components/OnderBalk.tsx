import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppProvider";

export type TabKey = "index" | "favorieten" | "storingen" | "instellingen";

const TABS: { key: TabKey; label: string; aan: keyof typeof Ionicons.glyphMap; uit: keyof typeof Ionicons.glyphMap; pad: string }[] = [
  { key: "index", label: "Dichtbij", aan: "bus", uit: "bus-outline", pad: "/" },
  { key: "favorieten", label: "Favorieten", aan: "star", uit: "star-outline", pad: "/favorieten" },
  { key: "storingen", label: "Storingen", aan: "warning", uit: "warning-outline", pad: "/storingen" },
  { key: "instellingen", label: "Instellingen", aan: "settings", uit: "settings-outline", pad: "/instellingen" }
];

export function isTab(v: unknown): v is TabKey {
  return v === "index" || v === "favorieten" || v === "storingen" || v === "instellingen";
}

/** Tabbalk onderin. Ook gebruikt op haltebord en ritverloop, zodat je altijd snel terug kunt. */
export function OnderBalk({ actief, onKies }: { actief: TabKey; onKies?: (k: TabKey) => void }) {
  const { colors, storingenMijn } = useApp();
  const insets = useSafeAreaInsets();
  const onder = Math.max(insets.bottom, 6);
  return (
    <View style={[s.balk, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: onder, height: 62 + onder }]} accessibilityRole="tablist">
      {TABS.map((t) => {
        const aan = t.key === actief;
        const kleur = aan ? colors.accent : colors.tabInactive;
        return (
          <Pressable
            key={t.key}
            style={s.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: aan }}
            accessibilityLabel={t.key === "storingen" && storingenMijn ? `${t.label}, ${storingenMijn} bij je favorieten` : t.label}
            onPress={() => (onKies ? onKies(t.key) : router.navigate(t.pad as any))}
          >
            <View>
              <Ionicons name={aan ? t.aan : t.uit} size={24} color={kleur} />
              {t.key === "storingen" && storingenMijn > 0 ? (
                <View style={[s.bolletje, { backgroundColor: colors.red, borderColor: colors.surface }]}>
                  <Text style={s.bolletjeText}>{storingenMijn > 9 ? "9+" : storingenMijn}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[s.label, { color: kleur, fontWeight: aan ? "700" : "500" }]}>{t.label}</Text>
            {aan ? <View style={[s.streep, { backgroundColor: colors.accent }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  balk: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth * 2 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingTop: 6 },
  label: { fontSize: 12 },
  streep: { position: "absolute", bottom: 0, width: 48, height: 3, borderRadius: 2 },
  bolletje: { position: "absolute", top: -5, right: -11, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  bolletjeText: { color: "#fff", fontSize: 10, fontWeight: "800" }
});
