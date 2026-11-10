import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../components/LocalizedText";
import { HalteKaart } from "../../components/HalteKaart";
import { RitStatusLabel } from "../../components/RitStatusLabel";
import { RitTijdcel } from "../../components/RitTijdcel";
import { Kaart, Kop, Leeg, LijnBadge } from "../../components/ui";
import { useApp } from "../../context/AppProvider";
import { api } from "../../lib/api";
import { MAX_FAVORIETEN, vertrekBijLijnFavoriet } from "../../lib/favorieten";
import { datumKort } from "../../lib/format";
import { useNu, usePolling } from "../../lib/hooks";
import type { FavHalte, FavLijn, Vertrek } from "../../lib/types";

/** Plaats staat al onder de titel. Laat officiële namen zonder plaatsvoorvoegsel intact. */
function halteTitel({ naam, plaats }: FavHalte): string {
  if (typeof naam !== "string" || !naam.trim()) return "Halte";
  const stad = typeof plaats === "string" ? plaats.trim().toLocaleLowerCase("nl") : "";
  if (!stad) return naam;
  const delen = naam.split(",").map((deel) => deel.trim());
  const zonderPlaats = delen.findIndex((deel) => deel.toLocaleLowerCase("nl") !== stad);
  return zonderPlaats > 0 ? delen.slice(zonderPlaats).join(", ") : naam;
}

function FavKaart({ f, nu }: { f: FavHalte; nu: number }) {
  const { instellingen } = useApp();
  const poll = usePolling(`fav:${f.id}`, () => api.halte(f.id, "alles", 3),
    instellingen.databesparing ? 60_000 : 20_000);
  return (
    <HalteKaart
      id={f.id}
      naam={halteTitel(f)}
      plaats={f.plaats}
      modi={poll.data?.modi}
      vertrekken={(poll.data?.vertrekken ?? []).slice(0, 3)}
      storingen={poll.data?.storingen.length ?? 0}
      fout={poll.data ? null : poll.fout}
      laden={poll.laden && !poll.data}
      nu={nu}
      van="favorieten"
      ster
    />
  );
}

function FavLijnKaart({ f, nu }: { f: FavLijn; nu: number }) {
  const { colors, instellingen, taal, t } = useApp();
  const poll = usePolling(`fav-lijn:${f.id}`,
    () => api.lijnVertrekken(f.halte.id, f.lijn, f.modus, false),
    instellingen.databesparing ? 90_000 : 45_000);
  const komtNog = (v: Vertrek) => !v.vervallen && (v.vertrek_ms === null || v.vertrek_ms >= nu) &&
    vertrekBijLijnFavoriet(v, f);
  const volgt = poll.data?.volgende_rit;
  const eerstvolgend = poll.data?.vertrekken.find(komtNog) ?? (volgt && komtNog(volgt) ? volgt : null);
  const datumMs = eerstvolgend?.vertrek_ms ?? (eerstvolgend?.rit?.datum
    ? Date.parse(`${eerstvolgend.rit.datum}T12:00:00`) : null);
  const dag = datumMs !== null && Number.isFinite(datumMs) &&
    new Date(datumMs).toDateString() !== new Date(nu).toDateString()
    ? datumKort(datumMs, taal) : "";
  const naam = halteTitel(f.halte);
  const richting = `Richting ${f.richting}`;
  return (
    <Kaart>
      <Pressable
        onPress={() => router.push({ pathname: "/halte/[id]", params: {
          id: f.halte.id, naam, plaats: f.halte.plaats, van: "favorieten",
          lijn: f.lijn, richting: f.richting, modus: f.modus, vervoerder: f.vervoerder
        } })}
        accessibilityRole="button"
        accessibilityLabel={t(`Haltebord ${naam}, richting ${f.richting}, lijn ${f.lijn}`)}
        android_ripple={{ color: colors.divider }}
        style={s.lijnKaart}
      >
        <View style={s.lijnKop}>
          <LijnBadge lijn={f.lijn} modus={f.modus} vervoerder={f.vervoerder} kleur={f.kleur} tekstkleur={f.tekstkleur} />
          <View style={s.bewerkTeksten}>
            <Text style={[s.bewerkNaam, { color: colors.text }]}>{richting}</Text>
            <Text style={[s.metaSub, { color: colors.sub }]}>{`Vanaf ${naam}`}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.sub} />
        </View>
        <View style={[s.lijnVertrek, { borderTopColor: colors.divider }]}>
          {eerstvolgend ? <>
            <View style={s.bewerkTeksten}>
              <Text style={[s.metaSub, { color: colors.sub }]}>Eerstvolgend vertrek</Text>
              <RitStatusLabel live={eerstvolgend.live} vervallen={eerstvolgend.vervallen} afwijkingMin={eerstvolgend.vertraging_min} />
            </View>
            <View style={s.lijnVertrektijd}>
              {dag ? <Text style={[s.metaSub, { color: colors.sub }]}>{dag}</Text> : null}
              <RitTijdcel verwacht={eerstvolgend.verwacht} gepland={eerstvolgend.gepland}
                live={eerstvolgend.live} vervallen={eerstvolgend.vervallen} afwijkingMin={eerstvolgend.vertraging_min} />
            </View>
          </> : (
            <Text style={[s.metaSub, { color: colors.sub }]}>
              {poll.laden ? "Laden…" : !poll.data && poll.fout ? poll.fout : "Geen vertrekken in de komende tijd"}
            </Text>
          )}
        </View>
      </Pressable>
    </Kaart>
  );
}

function BewerkRij({ naam, plaats, index, aantal, verplaats, verwijder }: {
  naam: string; plaats: string; index: number; aantal: number;
  verplaats: (richting: -1 | 1) => void; verwijder: () => void;
}) {
  const { colors, t } = useApp();
  return (
    <View style={[s.bewerkRij, { borderTopColor: colors.divider, borderTopWidth: index ? StyleSheet.hairlineWidth * 2 : 0 }]}>
      <View style={s.bewerkTeksten}>
        <Text style={[s.bewerkNaam, { color: colors.text }]}>{naam}</Text>
        {plaats ? <Text style={[s.metaSub, { color: colors.sub }]}>{plaats}</Text> : null}
      </View>
      <Pressable onPress={() => verplaats(-1)} disabled={index === 0} style={s.icoKnop}
        accessibilityRole="button" accessibilityLabel={t(`${naam} omhoog`)}>
        <Ionicons name="chevron-up" size={22} color={index === 0 ? colors.border : colors.text} />
      </Pressable>
      <Pressable onPress={() => verplaats(1)} disabled={index === aantal - 1} style={s.icoKnop}
        accessibilityRole="button" accessibilityLabel={t(`${naam} omlaag`)}>
        <Ionicons name="chevron-down" size={22} color={index === aantal - 1 ? colors.border : colors.text} />
      </Pressable>
      <Pressable onPress={verwijder} style={s.icoKnop} accessibilityRole="button" accessibilityLabel={t(`${naam} verwijderen`)}>
        <Ionicons name="trash-outline" size={22} color={colors.red} />
      </Pressable>
    </View>
  );
}

type Verwijderd = { soort: "halte"; item: FavHalte; index: number } | { soort: "lijn"; item: FavLijn; index: number };
const zoekFavoriet = () => router.push({ pathname: "/zoek", params: { doel: "favorieten" } });

export default function Favorieten() {
  const {
    colors, favorieten, verwijderFavoriet, herstelFavoriet, verplaatsFavoriet,
    favorietenLijnen, verwijderLijnFavoriet, herstelLijnFavoriet, verplaatsLijnFavoriet, t
  } = useApp();
  const [bewerk, setBewerk] = useState(false);
  const [verwijderd, setVerwijderd] = useState<Verwijderd | null>(null);
  const lijst = verwijderd?.soort === "lijn" ? favorietenLijnen : favorieten;
  const kanHerstellen = verwijderd !== null && lijst.length < MAX_FAVORIETEN &&
    !lijst.some((f) => f.id === verwijderd.item.id);
  const nu = useNu(10_000);
  const plaatsen = [...new Set(favorieten.map((f) => f.plaats).filter(Boolean))];
  const locatieLabel = plaatsen.length === 1 ? plaatsen[0] : `${favorieten.length} haltes`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Kop
        groot
        titel="Favorieten"
        rechts={
          favorieten.length || favorietenLijnen.length || kanHerstellen ? (
            <Pressable onPress={() => setBewerk((b) => !b)} accessibilityRole="button" style={s.bewerk} hitSlop={6}>
              <Text style={[s.bewerkText, { color: colors.accent }]}>{bewerk ? "Klaar" : "Bewerk"}</Text>
            </Pressable>
          ) : null
        }
      />
      <View style={[s.zoekStrook, { backgroundColor: colors.header, borderBottomColor: colors.border }]}>
        <Pressable onPress={zoekFavoriet} accessibilityRole="search" accessibilityLabel={t("Zoek halte om toe te voegen")}
          style={[s.zoekbalk, { backgroundColor: colors.surface2 }]}>
          <Ionicons name="search-outline" size={20} color={colors.sub} />
          <Text style={[s.zoekText, { color: colors.sub }]}>Zoek halte om toe te voegen</Text>
        </Pressable>
      </View>
      {kanHerstellen ? (
        <View style={[s.herstelStrook, { backgroundColor: colors.infoBg, borderBottomColor: colors.border }]}>
          <Text accessibilityLiveRegion="polite" style={[s.herstelMelding, { color: colors.text }]}>
            {`${verwijderd.soort === "halte" ? halteTitel(verwijderd.item) : `${verwijderd.item.lijn} ${t("naar")} ${verwijderd.item.richting}`} verwijderd uit favorieten`}
          </Text>
          <Pressable onPress={() => {
            if (verwijderd.soort === "halte") herstelFavoriet(verwijderd.item, verwijderd.index);
            else herstelLijnFavoriet(verwijderd.item, verwijderd.index);
            setVerwijderd(null);
          }} accessibilityRole="button" accessibilityLabel={t("Ongedaan maken")} style={s.herstelActie}>
            <Text style={[s.herstelKnop, { color: colors.infoText }]}>Ongedaan maken</Text>
          </Pressable>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={s.lijst}>
        <View style={s.metaRij}>
          <Text style={[s.metaTitel, { color: colors.text }]} accessibilityRole="header">Mijn haltes</Text>
          {favorieten.length ? (
            <View style={[s.locatieChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="location-sharp" size={12} color={colors.accent} />
              <Text style={[s.locatieTekst, { color: colors.sub }]} numberOfLines={1}>{locatieLabel}</Text>
            </View>
          ) : null}
        </View>
        {!favorieten.length ? (
          <Leeg
            icoon="star-outline"
            titel="Nog geen favorieten"
            tekst="Tik op de ster bij een halte om hem hier te bewaren."
            knop={{ label: "Zoek een halte", onPress: zoekFavoriet }}
          />
        ) : bewerk ? (
          <Kaart>
            {favorieten.map((f, i) => (
              <BewerkRij key={f.id} naam={halteTitel(f)} plaats={f.plaats} index={i} aantal={favorieten.length}
                verplaats={(richting) => verplaatsFavoriet(f.id, richting)}
                verwijder={() => {
                  setVerwijderd({ soort: "halte", item: f, index: i });
                  verwijderFavoriet(f.id);
                }}
              />
            ))}
          </Kaart>
        ) : (
          favorieten.map((f) => <FavKaart key={f.id} f={f} nu={nu} />)
        )}
        <Text style={[s.metaTitel, s.lijnenTitel, { color: colors.text }]} accessibilityRole="header">Mijn lijnen</Text>
        {!favorietenLijnen.length ? (
          <Text style={[s.metaSub, { color: colors.sub }]}>Tik op de ster bij een rit om de lijn, richting en instaphalte te bewaren.</Text>
        ) : bewerk ? (
          <Kaart>
            {favorietenLijnen.map((f, i) => (
              <BewerkRij key={f.id} naam={`${f.lijn} ${t("naar")} ${f.richting}`} plaats={`Vanaf ${halteTitel(f.halte)}`}
                index={i} aantal={favorietenLijnen.length}
                verplaats={(richting) => verplaatsLijnFavoriet(f.id, richting)}
                verwijder={() => {
                  setVerwijderd({ soort: "lijn", item: f, index: i });
                  verwijderLijnFavoriet(f.id);
                }}
              />
            ))}
          </Kaart>
        ) : (
          favorietenLijnen.map((f) => <FavLijnKaart key={f.id} f={f} nu={nu} />)
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  lijst: { padding: 14, paddingTop: 17, gap: 12, paddingBottom: 26 },
  zoekStrook: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  zoekbalk: { height: 49, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 15 },
  zoekText: { fontSize: 15 },
  metaRij: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 1 },
  metaTitel: { fontSize: 18, fontWeight: "700" },
  metaSub: { fontSize: 13, marginTop: 2 },
  lijnenTitel: { marginTop: 6 },
  locatieChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, maxWidth: "54%" },
  locatieTekst: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  bewerk: { height: 44, justifyContent: "center", paddingHorizontal: 10, borderRadius: 12 },
  bewerkText: { fontSize: 16, fontWeight: "600" },
  herstelStrook: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderBottomWidth: 1 },
  herstelMelding: { fontSize: 14, flex: 1, paddingVertical: 8 },
  herstelActie: { minHeight: 44, maxWidth: "50%", justifyContent: "center", paddingHorizontal: 8, paddingVertical: 6 },
  herstelKnop: { fontSize: 14, fontWeight: "700" },
  bewerkRij: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 16, paddingRight: 6, minHeight: 60 },
  bewerkTeksten: { flex: 1, minWidth: 0 },
  bewerkNaam: { fontSize: 16, fontWeight: "600" },
  lijnKaart: { paddingHorizontal: 15, paddingVertical: 12, gap: 10 },
  lijnKop: { flexDirection: "row", alignItems: "center", gap: 10 },
  lijnVertrek: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth * 2, paddingTop: 8 },
  lijnVertrektijd: { alignItems: "flex-end" },
  icoKnop: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }
});
