import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import type { Modus, Vertrek } from "../lib/types";
import type { TabKey } from "./OnderBalk";
import { Kaart } from "./ui";
import { VertrekRegel } from "./VertrekRegel";

/** Kaartje met halte + eerstvolgende vertrekken (Dichtbij en Favorieten). Tik = haltebord. */
export function HalteKaart({
  id,
  naam,
  plaats,
  sub,
  modi,
  vertrekken,
  storingen,
  fout,
  nu,
  van,
  ster,
  laden
}: {
  id: string;
  naam: string;
  plaats?: string;
  sub?: string;
  modi?: Modus[];
  vertrekken: Vertrek[];
  storingen?: number;
  fout?: string | null;
  nu: number;
  van: TabKey;
  ster?: boolean;
  laden?: boolean;
}) {
  const { colors } = useApp();
  const trein = (modi || []).includes("train");
  const open = () => router.push({ pathname: "/halte/[id]", params: { id, van, naam, plaats: plaats || "" } });
  return (
    <Kaart>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Vertrektijden ${naam}${sub ? `, ${sub}` : ""}`} android_ripple={{ color: colors.divider }} style={s.binnen}>
        <View style={s.kop}>
          {ster ? (
            <Ionicons name="star" size={24} color={colors.star} />
          ) : (
            <View style={[s.icoon, { backgroundColor: colors.surface2 }]}>
              <Ionicons name={trein ? "train-outline" : "bus-outline"} size={22} color={colors.accent} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={s.naamRij}>
              <Text style={[s.naam, { color: colors.text }]} numberOfLines={1}>
                {naam}
              </Text>
              {storingen ? <Ionicons name="warning" size={16} color={colors.delay} accessibilityLabel="Er is een storing" /> : null}
            </View>
            {sub ? <Text style={[s.sub, { color: colors.sub }]}>{sub}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.sub} />
        </View>
        {vertrekken.slice(0, 2).map((v, i) => (
          <VertrekRegel key={`${v.lijn}-${v.vertrek_ms}-${i}`} v={v} nu={nu} compact eerste={false} />
        ))}
        {!vertrekken.length ? (
          <Text style={[s.geen, { color: colors.sub, borderTopColor: colors.divider }]}>
            {laden ? "Laden…" : fout ? fout : "Geen vertrekken in de komende tijd"}
          </Text>
        ) : null}
      </Pressable>
    </Kaart>
  );
}

const s = StyleSheet.create({
  binnen: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  kop: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 8 },
  icoon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  naamRij: { flexDirection: "row", alignItems: "center", gap: 6 },
  naam: { fontSize: 18, fontWeight: "700", flexShrink: 1 },
  sub: { fontSize: 14, marginTop: 1 },
  geen: { fontSize: 14, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth * 2 }
});
