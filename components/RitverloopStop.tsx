import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { Text } from "./LocalizedText";
import { RijdendVoertuig } from "./RijdendVoertuig";
import { RitTijdcel } from "./RitTijdcel";
import { RitStatusLabel } from "./RitStatusLabel";
import { useApp } from "../context/AppProvider";
import { afwijkingTekst, volgendeHalteTekst, type RitV2Stop } from "../lib/ritverloopV2";

export function RitverloopStop({ r, volgende, laatste, vorigeHoogte, hoogte, fractie, trein, nu, t,
  jouwHalte = false, vertrekhalte = false, onLayout }: {
  r: RitV2Stop; volgende: boolean; laatste: boolean; vorigeHoogte: number; hoogte: number;
  fractie: number | null; trein: boolean; nu: number; t: (s: string) => string;
  jouwHalte?: boolean; vertrekhalte?: boolean; onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { colors, instellingen } = useApp();
  const { fontScale } = useWindowDimensions();
  const groteTekst = instellingen.groteTekst || fontScale >= 1.3;
  const { h, index, naam, plaats, verwacht, gepland, vertragingMin, verwachtMs, gepasseerd } = r;
  const eta = volgende && !gepasseerd ? volgendeHalteTekst(verwachtMs, nu, t) : null;
  const afwijkend = r.live && !h.vervalt && vertragingMin !== 0;
  const vroeg = afwijkend && vertragingMin < 0;
  const zichtbaarNaam = jouwHalte ? h.naam : naam;
  const markeer = jouwHalte || vertrekhalte;
  return (
    <View
      onLayout={onLayout}
      style={[s.row, { minHeight: markeer ? (groteTekst ? 100 : 82) : hoogte,
        backgroundColor: volgende ? colors.infoBg : jouwHalte ? colors.surface2 : colors.surface,
        zIndex: fractie !== null ? 3 : 0 },
        !markeer && { height: hoogte },
        markeer && { paddingVertical: 8 },
        jouwHalte && { borderWidth: 1, borderColor: colors.accent, borderRadius: 10 }]}
      accessible accessibilityRole="text"
      accessibilityLabel={verwacht + ", " + zichtbaarNaam +
        (plaats ? ", " + plaats : "") +
        (afwijkend ? ", " + t(afwijkingTekst(vertragingMin)) : "") +
        (jouwHalte ? ", " + t("Jouw halte") : "") +
        (vertrekhalte ? ", " + t("Vertrekhalte") : "") +
        (volgende ? ", " + t("Volgende halte") : "")}
    >
      <View style={s.timeColumn}>
        <RitTijdcel
          verwacht={verwacht} gepland={gepland}
          afwijkingMin={vertragingMin} live={r.live}
          vervallen={h.vervalt} compact
        />
      </View>
      <View style={s.rail}>
        <View style={[s.topLine, {
          backgroundColor: index === 0 ? "transparent" : gepasseerd ? colors.rail : colors.accent
        }]} />
        <View style={[s.bottomLine, {
          backgroundColor: laatste ? "transparent" : gepasseerd ? colors.rail : colors.accent
        }]} />
        <View style={[s.stopDot, {
          borderColor: gepasseerd ? colors.muted : colors.accent,
          backgroundColor: gepasseerd ? colors.muted : colors.surface
        }]} />
        {fractie !== null ? (
          <RijdendVoertuig voortgang={fractie} vorigeHoogte={vorigeHoogte}
            huidigeHoogte={hoogte} geredenKleur={colors.rail}
            teRijdenKleur={colors.accent} trein={trein} />
        ) : null}
      </View>
      <View style={s.labelColumn}>
        <Text style={[s.name, { color: gepasseerd ? colors.sub : colors.text },
          volgende && s.nextName, h.vervalt && s.strike]}
          numberOfLines={markeer ? undefined : 1}>{zichtbaarNaam}</Text>
        {jouwHalte ? (
          <View style={[s.jouwChip, { backgroundColor: colors.infoBg, borderColor: colors.accent }]}>
            <Text style={[s.jouwTekst, { color: colors.infoText }]}>Jouw halte</Text>
          </View>
        ) : null}
        {vertrekhalte ? (
          <Text style={[s.eersteTekst, { color: colors.sub }]}>Vertrekhalte</Text>
        ) : null}
        {h.vervalt ? (
          <RitStatusLabel live={false} vervallen afwijkingMin={0} />
        ) : vroeg ? (
          <Text style={[s.earlyText, { color: colors.early }]} numberOfLines={1}>
            {t(afwijkingTekst(vertragingMin))}
          </Text>
        ) : null}
        {volgende && eta !== null ? (
          <Text style={[s.eta, { color: colors.infoText }]} numberOfLines={1}>
            {eta}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function HalteVouwknop({ label, omhoog, onPress }: {
  label: string; omhoog?: boolean; onPress: () => void
}) {
  const { colors } = useApp();
  return (
    <Pressable style={s.fold} accessibilityRole="button" accessibilityLabel={label}
      onPress={onPress}>
      <Text style={[s.foldText, { color: colors.accent }]}>{label}</Text>
      <Ionicons name={omhoog ? "chevron-up" : "chevron-down"} color={colors.accent} size={18} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "stretch", overflow: "visible" },
  timeColumn: { width: 68, paddingLeft: 0, justifyContent: "center" },
  timeMain: { flexDirection: "row", gap: 3, alignItems: "baseline" },
  time: { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  delay: { fontSize: 12, fontWeight: "700" },
  earlyText: { fontSize: 11, fontWeight: "700", marginTop: 1 },
  jouwChip: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 7,
    alignSelf: "flex-start", paddingVertical: 3, marginTop: 5, maxWidth: "100%" },
  jouwTekst: { fontSize: 12, fontWeight: "700" },
  eersteTekst: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  planned: { fontSize: 11, textDecorationLine: "line-through", marginTop: 1 },
  rail: { width: 28, alignItems: "center", justifyContent: "center", overflow: "visible" },
  topLine: { position: "absolute", left: 13, top: 0, width: 2, height: "50%" },
  bottomLine: { position: "absolute", left: 13, bottom: 0, width: 2, height: "50%" },
  stopDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, zIndex: 1 },
  labelColumn: { flex: 1, minWidth: 0, justifyContent: "center", paddingLeft: 5, paddingRight: 5 },
  name: { fontSize: 15, fontWeight: "600" },
  nextName: { fontWeight: "700" },
  eta: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  strike: { textDecorationLine: "line-through" },
  fold: { height: 44, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 6, minWidth: 44 },
  foldText: { fontSize: 13, fontWeight: "700" }
});
