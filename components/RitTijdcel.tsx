import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./LocalizedText";
import { useApp } from "../context/AppProvider";
import { bepaalRitStatus } from "../lib/ritStatus";

export type RitTijdcelProps = {
  verwacht: string;
  gepland: string;
  live: boolean;
  vervallen: boolean;
  afwijkingMin: number;
  /** Bord toont ook de bestaande compacte tijd-tot-vertrekregel. */
  aftel?: string;
  compact?: boolean;
  /** Haltebord: kleinere cijfers, geen derde regel met de planning. */
  klein?: boolean;
  /** Gepasseerde halte: tijd in gedempte kleur. */
  gedimd?: boolean;
  /** Haltebord toont de afwijking op de regel onder de bestemming. */
  zonderAfwijking?: boolean;
  /** Haltebord: tijd groen bij live op tijd, in de afwijkingskleur bij vertraging of te vroeg, anders gewoon. */
  statusKleur?: boolean;
};

/** Exact dezelfde klok, afwijking en doorgestreepte planning voor bord en rit. */
export function RitTijdcel({ verwacht, gepland, live, vervallen, afwijkingMin, aftel, compact, klein, gedimd, zonderAfwijking, statusKleur }: RitTijdcelProps) {
  const { colors } = useApp();
  const status = bepaalRitStatus({ live, vervallen, afwijkingMin });
  const gewijzigd = status.heeftLive && status.afwijkingMin !== 0 && gepland && gepland !== verwacht
    && !klein;
  const getoondeTijd = !live ? gepland || verwacht : verwacht || gepland;
  const afwijkt = status.afwijkingMin;
  const afwijkingKleur = afwijkt > 0 ? colors.red : colors.early;
  return (
    <View style={[s.cel, compact ? s.compact : s.bord]}>
      {aftel && !vervallen ? (
        <Text style={[s.aftel, klein && s.aftelKlein, { color: colors.text }]}>{aftel}</Text>
      ) : null}
      <View style={s.tijdRij}>
        <Text style={[s.tijd, klein && (aftel && !vervallen ? s.tijdKleinOnder : s.tijdKlein), klein && !compact && !aftel && s.tijdBord,
          { color: vervallen ? colors.muted : gedimd || (aftel && klein) ? colors.sub
            : statusKleur && status.heeftLive ? (afwijkt !== 0 ? afwijkingKleur : colors.live) : colors.text },
          vervallen && s.doorgestreept]}>
          {vervallen ? gepland || verwacht || "—" : getoondeTijd || "—"}
        </Text>
        {afwijkt !== 0 && !vervallen && !zonderAfwijking ? (
          <Text style={[s.afwijking, { color: afwijkingKleur }]}>
            {afwijkt > 0 ? `+${afwijkt}` : `−${Math.abs(afwijkt)}`}
          </Text>
        ) : null}
      </View>
      {gewijzigd ? (
        <Text style={[s.plan, { color: colors.sub }]}>{gepland}</Text>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  cel: { justifyContent: "center", minWidth: 0 },
  bord: { alignItems: "flex-end", maxWidth: 120 },
  compact: { alignItems: "flex-start" },
  aftel: { fontSize: 16, fontWeight: "800" },
  aftelKlein: { fontSize: 13 },
  tijdKlein: { fontSize: 13 },
  tijdBord: { fontSize: 14 },
  tijdKleinOnder: { fontSize: 11, fontWeight: "600" },
  tijdRij: { flexDirection: "row", alignItems: "baseline", gap: 4, flexWrap: "nowrap" },
  tijd: { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  afwijking: { fontSize: 11, fontWeight: "800" },
  plan: { fontSize: 11, textDecorationLine: "line-through", marginTop: 1 },
  doorgestreept: { textDecorationLine: "line-through" }
});
