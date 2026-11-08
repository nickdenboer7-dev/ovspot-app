import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { isTab, OnderBalk } from "../../components/OnderBalk";
import { StoringKaart } from "../../components/StoringKaart";
import { Chips, FoutBalk, Kaart, Kop, KopKnop, Laden, Leeg } from "../../components/ui";
import { VertrekRegel } from "../../components/VertrekRegel";
import { useApp } from "../../context/AppProvider";
import { api } from "../../lib/api";
import { lijnBadgeHeeftRand, lijnKleur } from "../../constants/wayfinding";
import { geldigeLijnen } from "../../lib/wayfindingV2";
import { storingPastBijModus } from "../../lib/storingPerModus";
import { klok } from "../../lib/format";
import { busstationZoekterm, heeftBusstationAanvullingNodig, kiesGekoppeldBusstation, voegBusstationToe } from "../../lib/stationGroups";
import { useNu, usePolling } from "../../lib/hooks";
import type { Vertrek } from "../../lib/types";

type ModusChip = { key: string; label: string; icoon?: keyof typeof Ionicons.glyphMap };

function modaliteitChip(modus: string): ModusChip {
  switch (modus) {
    case "train": return { key: modus, label: "Trein", icoon: "train-outline" };
    case "bus": return { key: modus, label: "Bus", icoon: "bus-outline" };
    case "tram": return { key: modus, label: "Tram", icoon: "subway-outline" };
    case "metro": return { key: modus, label: "Metro", icoon: "subway-outline" };
    case "ferry": return { key: modus, label: "Veerboot", icoon: "boat-outline" };
    default: return { key: modus, label: modus.charAt(0).toUpperCase() + modus.slice(1), icoon: "ellipse-outline" };
  }
}

export default function Haltebord() {
  const p = useLocalSearchParams<{ id: string; van?: string; naam?: string; plaats?: string; groep?: string; lijnen?: string; modus?: string }>();
  const id = String(p.id || "");
  const van = isTab(p.van) ? p.van : "index";
  const { colors, instellingen, isFavoriet, wisselFavoriet } = useApp();
  // De opgeslagen instelling blijft een voorkeur; op haltes zonder die modus tonen we alles.
  const gevraagdeModus = ["train", "metro", "tram", "bus", "ferry"].includes(String(p.modus))
    ? String(p.modus) : null;
  const [gekozenModus, setGekozenModus] = useState<string>(
    gevraagdeModus || (instellingen.filter === "trein" ? "train" : instellingen.filter)
  );
  const [storingenOpen, setStoringenOpen] = useState(false);
  const nu = useNu(10_000);

  // Haal alle modaliteiten op: de API kent nog geen afzonderlijk tram- of metrofilter.
  // Zo blijven de mogelijke chips stabiel bij het wisselen van filter.
  const poll = usePolling(`halte:${id}`, () => api.halte(id, "alles", 60), 15_000);
  const hoofd = poll.data;
  // Compatibiliteitsaanvulling zolang de live API nog niet alle fysieke
  // parent_station- en busstationclusters aan het stationsbord koppelt.
  // Onafhankelijke polling: treinvertrekken blijven direct zichtbaar.
  const busPoll = usePolling(
    `station-bus:${hoofd?.id || "geen"}:${hoofd?.plaats || ""}:${heeftBusstationAanvullingNodig(hoofd) ? "ja" : "nee"}`,
    async () => {
      if (!heeftBusstationAanvullingNodig(hoofd)) return null;
      const gevonden = await api.zoek(busstationZoekterm(hoofd));
      const busstation = kiesGekoppeldBusstation(hoofd, gevonden.resultaten);
      return busstation ? api.halte(busstation.id, "alles", 60) : null;
    },
    45_000
  );
  const h = useMemo(() => hoofd ? voegBusstationToe(hoofd, busPoll.data) : null, [hoofd, busPoll.data]);
  const naam = h?.naam || String(p.naam || "Halte");
  const plaats = h?.plaats || String(p.plaats || "");
  const fav = isFavoriet(id);
  // De gekozen zoekkaart blijft filterbaar, zelfs als die modus momenteel
  // geen vertrektijden in het API-tijdvenster heeft (bijv. laatste pont).
  const modi = [...new Set([...(h?.modi || []), ...(h?.vertrekken || []).map(v => v.modus),
    ...(gevraagdeModus ? [gevraagdeModus] : [])].filter((m): m is string =>
      typeof m === "string" && m.trim().length > 0))]
    .sort((a, b) => {
      const volgorde = ["train", "metro", "tram", "bus", "ferry"];
      const aIndex = volgorde.indexOf(a), bIndex = volgorde.indexOf(b);
      return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
    });
  const meerdereModi = modi.length >= 2;
  const actieveModus = meerdereModi
    ? (modi.includes(gekozenModus) ? gekozenModus
      : gevraagdeModus && modi.includes(gevraagdeModus) ? gevraagdeModus
      : modi.includes("train") ? "train" : modi[0])
    : "alles";
  const chips: ModusChip[] = modi.map(modaliteitChip);
  const vertrekken = (h?.vertrekken || []).filter(v => actieveModus === "alles" || v.modus === actieveModus);

  // Alleen horizontale gebaren (geen verticale scroll) wisselen het tabblad.
  const swipeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      meerdereModi && Math.abs(gesture.dx) > 25 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
    onPanResponderRelease: (_event, gesture) => {
      if (!meerdereModi || Math.abs(gesture.dx) < 65
        || Math.abs(gesture.dx) < Math.abs(gesture.dy) * 1.4) return;
      const huidig = modi.indexOf(actieveModus);
      const volgende = huidig + (gesture.dx < 0 ? 1 : -1);
      if (volgende >= 0 && volgende < modi.length) setGekozenModus(modi[volgende]);
    }
  }), [meerdereModi, actieveModus, modi.join("|")]);
  const titel = naam;
  const haltegroep = String(p.groep || "").trim();
  const plaatsSub = plaats && !naam.toLowerCase().includes(plaats.toLowerCase())
    && plaats.toLowerCase() !== haltegroep.toLowerCase() ? plaats : "";
  const groepSub = [plaatsSub, haltegroep].filter(Boolean).join(" · ");
  let lijnCatalogus: ReturnType<typeof geldigeLijnen> = [];
  try { lijnCatalogus = geldigeLijnen(JSON.parse(String(p.lijnen || "[]"))); } catch { /* Navigatieparameter is optioneel. */ }

  const openRit = (v: Vertrek) => {
    if (!v.rit) return;
    router.push({
      pathname: "/rit",
      params: {
        ...v.rit, van, lijn: v.lijn, bestemming: v.bestemming, vervoerder: v.vervoerder, modus: v.modus,
        kleur: v.kleur || v.lijn_kleur || "", tekstkleur: v.tekstkleur || v.lijn_tekstkleur || "",
        instap_halte: id, instap_naam: naam, instap_ms: v.vertrek_ms ? String(v.vertrek_ms) : "",
        richting: v.bestemming
      }
    });
  };

  // Filter waarschuwingen op GTFS-modus; een busomleiding zoals N89 mag
  // niet op het Metro- of Tram-tabblad worden getoond.
  const storingen = (h?.storingen ?? []).filter(st =>
    storingPastBijModus(st, actieveModus, lijnCatalogus, h?.vertrekken ?? [])
  );

  let lijst: React.ReactNode;
  if (poll.laden && !h) lijst = <Laden />;
  else if (!h && poll.fout)
    lijst = <Leeg icoon="cloud-offline-outline" titel="Kan vertrektijden niet laden" tekst={poll.fout} knop={{ label: "Opnieuw", onPress: () => void poll.verversen() }} />;
  else if (h && !vertrekken.length)
    lijst = (
      <Kaart style={s.geenVertrekken}>
        {lijnCatalogus.length > 0 && actieveModus === "alles" ? (
          <View style={s.lijnenCatalogus}>
            <Text style={[s.catalogusTitel, { color: colors.text }]}>Lijnen op deze halte</Text>
            <View style={s.lijnRij}>
              {lijnCatalogus.slice(0, 8).map((line, i) => {
                const k = lijnKleur(line.lijn, line.modus, line.vervoerder, line.kleur, line.tekstkleur);
                return (
                  <View key={`${line.lijn}-${line.vervoerder}-${i}`} style={[s.lijnBadge, { backgroundColor: k.bg }, lijnBadgeHeeftRand(k) && { borderWidth: 1, borderColor: "#CBD5E1" }]}>
                    <Text style={[s.lijnBadgeTekst, { color: k.fg }]}>{line.lijn}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
        <View style={[s.geenInformatie, { backgroundColor: colors.infoBg }]}>
          <Ionicons name="information-circle-outline" size={22} color={colors.infoText} />
          <Text style={[s.geenTekst, { color: colors.infoText }]}>
            {actieveModus === "alles" ? "Momenteel geen vertrekken in de komende tijd." : `Geen ${modaliteitChip(actieveModus).label.toLowerCase()}vertrekken in de komende tijd.`}
          </Text>
        </View>
      </Kaart>
    );
  else if (h)
    lijst = (
      <Kaart>
        {vertrekken.map((v, i) => (
          <VertrekRegel key={`${v.lijn}-${v.vertrek_ms}-${i}`} v={v} nu={nu} onPress={v.rit ? () => openRit(v) : undefined} />
        ))}
      </Kaart>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Kop
        terug
        titel={titel}
        detail={groepSub || undefined}
        sub={h ? `${h.verouderd ? "Verouderd · " : ""}Bijgewerkt ${klok(h.bijgewerkt)}` : "Laden…"}
        rechts={
          <KopKnop
            icoon={fav ? "star" : "star-outline"}
            kleur={fav ? colors.star : undefined}
            label={fav ? "Verwijder uit favorieten" : "Bewaar als favoriet"}
            onPress={() => wisselFavoriet({ id, naam, plaats })}
          />
        }
      />
      {meerdereModi ? (
<View style={[s.chips, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          {modi.length <= 3 ? (
            <Chips<string> opties={chips} waarde={actieveModus} onKies={setGekozenModus} vol />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Chips<string> opties={chips} waarde={actieveModus} onKies={setGekozenModus} />
            </ScrollView>
          )}
        </View>
      ) : null}
      <ScrollView
        {...swipeResponder.panHandlers}
        contentContainerStyle={s.inhoud}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => {
          void poll.verversen();
          if (heeftBusstationAanvullingNodig(hoofd)) void busPoll.verversen();
        }} colors={[colors.accent]} />}
      >
        {storingen.length ? (
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={() => setStoringenOpen((o) => !o)}
              style={[s.storing, { backgroundColor: colors.warnBg, borderColor: colors.warnBorder }]}
              accessibilityRole="button"
              accessibilityHint={storingenOpen ? "Inklappen" : "Toon storingen"}
            >
              <Ionicons name="alert-circle-outline" size={20} color={colors.delay} />
              <Text style={[s.storingText, { color: colors.warnText }]} numberOfLines={storingenOpen ? undefined : 1}>
                {storingen[0].titel}
                {storingen.length > 1 ? ` · +${storingen.length - 1}` : ""}
              </Text>
              <Ionicons name={storingenOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.delay} />
            </Pressable>
            {storingenOpen ? storingen.map((st) => <StoringKaart key={st.id} st={st} />) : null}
          </View>
        ) : null}
        {poll.fout && h ? <FoutBalk tekst={poll.fout} /> : null}
        {lijst}
      </ScrollView>
      <OnderBalk actief={van} />
    </View>
  );
}

const s = StyleSheet.create({
  chips: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  inhoud: { padding: 14, gap: 13, paddingBottom: 28 },
  storing: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, minHeight: 46, paddingVertical: 10 },
  storingText: { flex: 1, fontSize: 15, fontWeight: "600" },
  geenVertrekken: { padding: 16, gap: 15 },
  lijnenCatalogus: { gap: 11 },
  catalogusTitel: { fontSize: 15, fontWeight: "800" },
  lijnRij: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  lijnBadge: { minWidth: 39, minHeight: 29, paddingHorizontal: 9, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  lijnBadgeTekst: { fontSize: 13, fontWeight: "800" },
  geenInformatie: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  geenTekst: { flex: 1, fontSize: 13, fontWeight: "600" }
});
