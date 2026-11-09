import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./LocalizedText";
import { useApp } from "../context/AppProvider";
import { periode } from "../lib/format";
import type { Storing } from "../lib/types";
import { Kaart, LijnBadge } from "./ui";

export function useSoortKleur() {
  const { colors } = useApp();
  return (soort: string) =>
    soort === "minder" || soort === "halte"
      ? { bg: colors.redBg, fg: colors.red }
      : soort === "omleiding"
        ? { bg: colors.warnBg, fg: colors.delay }
        : { bg: colors.infoBg, fg: colors.infoText };
}

export function StoringKaart({ st }: { st: Storing }) {
  const { colors, t, taal } = useApp();
  const kleur = useSoortKleur()(st.soort);
  const [open, setOpen] = useState(false);
  const wanneer = periode(st.vanaf_ms, st.tot_ms, Date.now(), taal);
  const haltes = (st.haltes || []).map((h) => h.naam).join(", ");
  const lang = st.tekst.length > 140;
  return (
    <Kaart style={s.kaart}>
      <Pressable onPress={() => lang && setOpen((o) => !o)} accessibilityRole={lang ? "button" : undefined} accessibilityHint={lang ? t(open ? "Inklappen" : "Hele melding lezen") : undefined}>
        <View style={s.kopRij}>
          <View style={[s.label, { backgroundColor: kleur.bg }]}>
            <Text style={[s.labelText, { color: kleur.fg }]}>{st.label}</Text>
          </View>
          <Text style={[s.wanneer, { color: colors.sub }]} numberOfLines={1}>
            {wanneer}
          </Text>
          {lang ? <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.sub} /> : null}
        </View>
        <Text style={[s.titel, { color: colors.text }]}>{st.titel}</Text>
        {st.tekst ? (
          <Text style={[s.tekst, { color: colors.sub }]} numberOfLines={open ? undefined : 4}>
            {st.tekst}
          </Text>
        ) : null}
        {st.lijnen.length || haltes ? (
          <View style={s.voet}>
            {st.lijnen.slice(0, 8).map((l) => (
              <LijnBadge key={l} lijn={l} modus={/^(IC|SPR|RS|RE|ST|ICD)/i.test(l) ? "train" : "bus"} />
            ))}
            {haltes ? (
              <Text style={[s.haltes, { color: colors.sub }]} numberOfLines={1}>
                {haltes}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </Kaart>
  );
}

const s = StyleSheet.create({
  kaart: { padding: 14, paddingHorizontal: 16 },
  kopRij: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  label: { paddingHorizontal: 8, height: 24, borderRadius: 6, justifyContent: "center" },
  labelText: { fontSize: 12, fontWeight: "700" },
  wanneer: { flex: 1, fontSize: 13 },
  titel: { fontSize: 17, fontWeight: "700", lineHeight: 22 },
  tekst: { fontSize: 15, lineHeight: 21, marginTop: 4 },
  voet: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 10 },
  haltes: { fontSize: 13, flexShrink: 1, marginLeft: 2 }
});
