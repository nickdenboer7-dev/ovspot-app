import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./LocalizedText";
import { RijdendVoertuig } from "./RijdendVoertuig";
import { RITV2, verwachteAankomstMin, type RitV2Stop } from "../lib/ritverloopV2";

export function RitverloopStop({ r, volgende, laatste, vorigeHoogte, hoogte, fractie, trein, nu, t }: {
  r: RitV2Stop; volgende: boolean; laatste: boolean; vorigeHoogte: number; hoogte: number;
  fractie: number | null; trein: boolean; nu: number; t: (s: string) => string;
}) {
  const { h, index, naam, plaats, toonPlaats, verwacht, gepland, vertragingMin, verwachtMs, gepasseerd } = r;
  const eta = volgende && !gepasseerd ? verwachteAankomstMin(verwachtMs, nu) : null;
  const vertraagd = !h.vervalt && vertragingMin > 0 && verwacht !== gepland;
  const showCity = !!plaats && toonPlaats;
  return (
    <View
      style={[s.row, { height: hoogte, backgroundColor: volgende ? RITV2.info : "#FFFFFF", zIndex: fractie !== null ? 3 : 0 }]}
      accessible accessibilityRole="text"
      accessibilityLabel={verwacht + ", " + naam +
        (plaats ? ", " + plaats : "") +
        (vertraagd ? ", +" + vertragingMin + " min" : "") +
        (volgende ? ", " + t("Volgende halte") : "")}
    >
      <View style={s.timeColumn}>
        <View style={s.timeMain}>
          <Text style={[s.time, { color: gepasseerd ? RITV2.muted : RITV2.ink },
            h.vervalt && s.strike]}>{verwacht}</Text>
          {vertraagd ? <Text style={s.delay}>+{vertragingMin}</Text> : null}
        </View>
        {vertraagd ? <Text style={s.planned}>{gepland}</Text> : null}
      </View>
      <View style={s.rail}>
        <View style={[s.topLine, {
          backgroundColor: index === 0 ? "transparent" : gepasseerd ? RITV2.pastLine : RITV2.blue
        }]} />
        <View style={[s.bottomLine, {
          backgroundColor: laatste ? "transparent" : gepasseerd ? RITV2.pastLine : RITV2.blue
        }]} />
        <View style={[s.stopDot, {
          borderColor: gepasseerd ? RITV2.pastDot : RITV2.blue,
          backgroundColor: gepasseerd ? RITV2.pastDot : "#FFFFFF"
        }]} />
        {fractie !== null ? (
          <RijdendVoertuig voortgang={fractie} vorigeHoogte={vorigeHoogte}
            huidigeHoogte={hoogte} geredenKleur={RITV2.pastLine}
            teRijdenKleur={RITV2.blue} trein={trein} />
        ) : null}
      </View>
      <View style={s.labelColumn}>
        <Text style={[s.name, { color: gepasseerd ? RITV2.muted : RITV2.ink },
          volgende && s.nextName, h.vervalt && s.strike]}
          numberOfLines={1}>{naam}</Text>
        {showCity ? <Text style={s.city} numberOfLines={1}>{plaats}</Text> : null}
        {volgende && eta !== null ? (
          <Text style={s.eta} numberOfLines={1}>
            {t("Volgende halte")} · {t("over")} {eta} min
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function HalteVouwknop({ label, omhoog, onPress }: {
  label: string; omhoog?: boolean; onPress: () => void
}) {
  return (
    <Pressable style={s.fold} accessibilityRole="button" accessibilityLabel={label}
      onPress={onPress}>
      <Text style={s.foldText}>{label}</Text>
      <Ionicons name={omhoog ? "chevron-up" : "chevron-down"} color={RITV2.blue} size={18} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "stretch", overflow: "visible" },
  timeColumn: { width: 68, paddingLeft: 0, justifyContent: "center" },
  timeMain: { flexDirection: "row", gap: 3, alignItems: "baseline" },
  time: { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  delay: { fontSize: 12, fontWeight: "700", color: RITV2.delay },
  planned: { fontSize: 11, color: RITV2.muted, textDecorationLine: "line-through", marginTop: 1 },
  rail: { width: 28, alignItems: "center", justifyContent: "center", overflow: "visible" },
  topLine: { position: "absolute", left: 13, top: 0, width: 2, height: "50%" },
  bottomLine: { position: "absolute", left: 13, bottom: 0, width: 2, height: "50%" },
  stopDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, zIndex: 1 },
  labelColumn: { flex: 1, minWidth: 0, justifyContent: "center", paddingLeft: 5, paddingRight: 5 },
  name: { fontSize: 15, fontWeight: "600" },
  nextName: { fontWeight: "700" },
  city: { fontSize: 11, color: RITV2.muted, marginTop: 1 },
  eta: { fontSize: 12, fontWeight: "600", color: RITV2.blue, marginTop: 2 },
  strike: { textDecorationLine: "line-through" },
  fold: { height: 44, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6, minWidth: 44 },
  foldText: { color: RITV2.blue, fontSize: 13, fontWeight: "700" }
});
