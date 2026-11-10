import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { PanResponder, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "../../components/LocalizedText";
import { isTab, OnderBalk } from "../../components/OnderBalk";
import { StoringKaart } from "../../components/StoringKaart";
import { Chips, FoutBalk, Kaart, Laden, Leeg } from "../../components/ui";
import { VertrekRegel } from "../../components/VertrekRegel";
import { OVspotSchermKop, OVspotIdentiteit } from "../../components/OVspotSchermKop";
import { StatusStrook } from "../../components/StatusStrook";
import { LiveBalk } from "../../components/LiveBalk";
import { useApp } from "../../context/AppProvider";
import { api } from "../../lib/api";
import { lijnBadgeHeeftRand, lijnKleur } from "../../constants/wayfinding";
import { geldigeLijnen } from "../../lib/wayfindingV2";
import { storingPastBijModus } from "../../lib/storingPerModus";
import { klok } from "../../lib/format";
import { vertrekBijLijnFavoriet } from "../../lib/favorieten";
import { combineerStatischeLijnen, filterHalteVertrekken, zoekStatischeLijnen, zichtbareStatischeLijnen } from "../../lib/halteLijnFilter";
import { voegStationVertrektijdenToe } from "../../lib/stationGroups";
import { useNu, usePolling } from "../../lib/hooks";
import type { Vertrek } from "../../lib/types";

type ModusChip = { key: string; label: string; icoon?: keyof typeof Ionicons.glyphMap };

function modaliteitChip(modus: string): ModusChip {
  switch (modus) {
    case "alles": return { key: modus, label: "Alles", icoon: "layers-outline" };
    case "train": return { key: modus, label: "Trein", icoon: "train-outline" };
    case "bus": return { key: modus, label: "Bus", icoon: "bus-outline" };
    case "tram": return { key: modus, label: "Tram", icoon: "subway-outline" };
    case "metro": return { key: modus, label: "Metro", icoon: "subway-outline" };
    case "ferry": return { key: modus, label: "Veerboot", icoon: "boat-outline" };
    default: return { key: modus, label: modus.charAt(0).toUpperCase() + modus.slice(1), icoon: "ellipse-outline" };
  }
}

export default function Haltebord() {
  const p = useLocalSearchParams<{
    id: string; van?: string; naam?: string; plaats?: string; groep?: string; lijnen?: string; modus?: string;
    lijn?: string; richting?: string; vervoerder?: string;
  }>();
  const id = String(p.id || "");
  const van = isTab(p.van) ? p.van : "index";
  const { colors, instellingen, isFavoriet, wisselFavoriet, zetFeedbackContext, t, taal } = useApp();
  // De opgeslagen instelling blijft een voorkeur; op haltes zonder die modus tonen we alles.
  const gevraagdeModus = ["train", "metro", "tram", "bus", "ferry"].includes(String(p.modus))
    ? String(p.modus) : null;
  const favorietLijn = typeof p.lijn === "string" ? p.lijn.trim() : "";
  const favorietRichting = typeof p.richting === "string" ? p.richting.trim() : "";
  const favorietVervoerder = typeof p.vervoerder === "string" ? p.vervoerder.trim() : "";
  const lijnFavoriet = useMemo(() => favorietLijn && favorietRichting && gevraagdeModus ? {
    lijn: favorietLijn, richting: favorietRichting, modus: gevraagdeModus, vervoerder: favorietVervoerder
  } : null, [favorietLijn, favorietRichting, gevraagdeModus, favorietVervoerder]);
  const [gekozenModus, setGekozenModus] = useState<string>(
    gevraagdeModus || (instellingen.filter === "trein" ? "train" : instellingen.filter)
  );
  const [selectedLine, setSelectedLine] = useState<string | null>(lijnFavoriet?.lijn ?? null);
  const [richtingActief, setRichtingActief] = useState(!!lijnFavoriet);
  const [lijnZoektekst, setLijnZoektekst] = useState("");
  const [zoekveldOpen, setZoekveldOpen] = useState(false);
  const [handmatigeModus, setHandmatigeModus] = useState(false);
  React.useEffect(() => {
    setSelectedLine(lijnFavoriet?.lijn ?? null);
    setRichtingActief(!!lijnFavoriet);
    setHandmatigeModus(false);
    setLijnZoektekst("");
    setZoekveldOpen(false);
  }, [id, lijnFavoriet]);
  const [storingenOpen, setStoringenOpen] = useState(false);
  const [ververst, setVervers] = useState(false);
  const nu = useNu(10_000);

  // Houd de bestaande /halte-data voor meldingen, metro/ferry en compatibiliteit.
  // Bij een station komen de vertrekregels zelf direct van /app/v2/vertrektijden.
  const poll = usePolling(`halte:${id}`, () => api.halte(id, "alles", 60),
    instellingen.databesparing ? 45_000 : 15_000);
  const hoofd = poll.data;
  // Ook vanaf een afzonderlijke haltepaal met naam "Station"/"Busstation"
  // dezelfde fysieke 350m-cluster openen, niet uitsluitend vanaf het treinparent.
  const isStation = !!hoofd && (hoofd.modi.includes("train")
    || /\b(?:station|busstation)\b/i.test(hoofd.naam));
  const stationPoll = usePolling(
    `station-350m:${id}:${isStation ? "station" : "geen-station"}`,
    () => isStation ? api.stationVertrektijden(id, 60) : Promise.resolve(null),
    instellingen.databesparing ? 45_000 : 15_000
  );
  const h = useMemo(
    () => hoofd ? voegStationVertrektijdenToe(hoofd, stationPoll.data) : null,
    [hoofd, stationPoll.data]
  );
  const naam = h?.naam || String(p.naam || "Halte");
  const plaats = h?.plaats || String(p.plaats || "");
  React.useEffect(() => {
    if (id) zetFeedbackContext({ view: "halte", stop_id: id, stop_name: naam });
  }, [id, naam, zetFeedbackContext]);
  const fav = isFavoriet(id);
  // Een zoekkaart levert alvast de statische GTFS-routelijst mee;
  // de live API levert de volledige halte-/350m-stationscatalogus.
  const lijnCatalogus = useMemo(() => {
    try { return geldigeLijnen(JSON.parse(String(p.lijnen || "[]")), 250); }
    catch { return []; }
  }, [p.lijnen]);
  const statischeLijnen = useMemo(
    () => combineerStatischeLijnen(
      stationPoll.data?.lijncatalogus, h?.lijncatalogus, lijnCatalogus,
      lijnFavoriet ? [lijnFavoriet] : []
    ),
    [stationPoll.data?.lijncatalogus, h?.lijncatalogus, lijnCatalogus, lijnFavoriet]
  );
  // De gekozen zoekkaart blijft filterbaar, zelfs als die modus momenteel
  // geen vertrektijden in het API-tijdvenster heeft (bijv. laatste pont).
  const modi = [...new Set([...(h?.modi || []), ...statischeLijnen.map(v => v.modus),
    ...(h?.vertrekken || []).map(v => v.modus),
    ...(gevraagdeModus ? [gevraagdeModus] : [])].filter((m): m is string =>
      typeof m === "string" && m.trim().length > 0))]
    .sort((a, b) => {
      const volgorde = ["train", "metro", "tram", "bus", "ferry"];
      const aIndex = volgorde.indexOf(a), bIndex = volgorde.indexOf(b);
      return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
    });
  // Voor een multimodaal station staan Trein + Bus chronologisch bij elkaar.
  // Expliciete keuzes via de chips blijven daarna gerespecteerd.
  const meerdereModi = modi.length >= 2;
  const multimodaalStation = modi.includes("train") && (modi.includes("bus") || modi.includes("tram"));
  const tabModi = multimodaalStation ? ["alles", ...modi] : modi;
  const actieveModus = richtingActief && lijnFavoriet ? lijnFavoriet.modus
    : multimodaalStation && !handmatigeModus ? "alles"
    : meerdereModi
      ? (tabModi.includes(gekozenModus) ? gekozenModus
        : gevraagdeModus && tabModi.includes(gevraagdeModus) ? gevraagdeModus
        : modi.includes("train") ? "train" : modi[0])
      : "alles";
  const chips: ModusChip[] = tabModi.map(modaliteitChip);
  const uniekeLijnen = useMemo(
    () => zichtbareStatischeLijnen(statischeLijnen, actieveModus),
    [statischeLijnen, actieveModus]
  );
  // Zoeken beïnvloedt alleen welke chips zichtbaar zijn, nooit de statische databron.
  const getoondeLijnChips = useMemo(
    () => zoekStatischeLijnen(uniekeLijnen, lijnZoektekst),
    [uniekeLijnen, lijnZoektekst]
  );
  // Na een GTFS-refresh kan een lijn verdwijnen: voorkom een verouderd leeg filter.
  const geselecteerdeLijn = selectedLine && uniekeLijnen.some(v => v.lijn === selectedLine)
    ? selectedLine : null;
  // Een geselecteerde chip krijgt een eigen GTFS-opvraag voor de volledige
  // resterende dienstdag. Het normale stationsbord behoudt zijn snelle 2u-venster.
  const lijnPoll = usePolling(
    `lijn-hele-dag:${id}:${geselecteerdeLijn || "alles"}:${actieveModus}:${isStation}`,
    () => geselecteerdeLijn
      ? api.lijnVertrekken(id, geselecteerdeLijn, actieveModus, isStation)
      : Promise.resolve(null),
    instellingen.databesparing ? 90_000 : 45_000
  );
  // Bij snel wisselen tussen chips geen oude API-respons van een andere lijn tonen.
  const lijnData = geselecteerdeLijn && lijnPoll.data?.lijn === geselecteerdeLijn
    && lijnPoll.data?.modus === actieveModus && lijnPoll.data?.halte_id === id
    ? lijnPoll.data : null;
  const basisVertrekken = filterHalteVertrekken(h?.vertrekken ?? [], actieveModus, geselecteerdeLijn);
  const richting = richtingActief ? lijnFavoriet : null;
  // Filter de reeds geladen vertrekken meteen. De volledige dienstdag vult deze aan zodra die binnen is.
  const bordVertrekken = lijnData?.vertrekken ?? basisVertrekken;
  const vertrekken = richting ? bordVertrekken.filter(v => vertrekBijLijnFavoriet(v, richting)) : bordVertrekken;
  const volgendeRit = lijnData?.volgende_rit;
  const volgendeInRichting = volgendeRit && (!richting || vertrekBijLijnFavoriet(volgendeRit, richting)) ? volgendeRit : null;

  const kiesLijn = (lijn: string | null) => {
    // Chips zijn al gefilterd op de actieve modaliteit.
    // Nogmaals op dezelfde chip tikken brengt 'Alles' terug.
    setSelectedLine(lijn === geselecteerdeLijn && !richtingActief ? null : lijn);
    setRichtingActief(false);
    if (lijn === null) setLijnZoektekst("");
  };
  const wisselModus = (modus: string) => {
    setHandmatigeModus(true);
    setGekozenModus(modus);
    setSelectedLine(null);
    setLijnZoektekst("");
    setRichtingActief(false);
  };

  // Alleen horizontale gebaren (geen verticale scroll) wisselen het tabblad.
  const swipeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) =>
      meerdereModi && Math.abs(gesture.dx) > 25 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
    onPanResponderRelease: (_event, gesture) => {
      if (!meerdereModi || Math.abs(gesture.dx) < 65
        || Math.abs(gesture.dx) < Math.abs(gesture.dy) * 1.4) return;
      const huidig = tabModi.indexOf(actieveModus);
      const volgende = huidig + (gesture.dx < 0 ? 1 : -1);
      if (volgende >= 0 && volgende < tabModi.length) {
        wisselModus(tabModi[volgende]);
      }
    }
  }), [meerdereModi, actieveModus, tabModi.join("|")]);
  const titel = naam;
  const haltegroep = String(p.groep || "").trim();
  const plaatsSub = plaats && !naam.toLowerCase().includes(plaats.toLowerCase())
    && plaats.toLowerCase() !== haltegroep.toLowerCase() ? plaats : "";
  const groepSub = [plaatsSub, haltegroep].filter(Boolean).join(" · ");
  const openRit = (v: Vertrek) => {
    if (!v.rit) return;
    const fysiekeHalte = "stop_id" in v && typeof v.stop_id === "string" ? v.stop_id : "";
    const fysiekeNaam = "halte" in v && typeof v.halte === "string" ? v.halte : "";
    router.push({
      pathname: "/rit",
      params: {
        ...v.rit, van, lijn: v.lijn, bestemming: v.bestemming, vervoerder: v.vervoerder, modus: v.modus,
        kleur: v.kleur || v.lijn_kleur || "", tekstkleur: v.tekstkleur || v.lijn_tekstkleur || "",
        instap_halte: v.rit.instap_halte || fysiekeHalte || id,
        instap_naam: v.rit.instap_naam || fysiekeNaam || naam,
        instap_plaats: plaats, instap_ms: v.vertrek_ms ? String(v.vertrek_ms) : "",
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
  if (poll.laden && !h && !lijnData) lijst = <Laden />;
  else if (!h && poll.fout && !lijnData)
    lijst = <Leeg icoon="cloud-offline-outline" titel="Kan vertrektijden niet laden" tekst={poll.fout} knop={{ label: "Opnieuw", onPress: () => void poll.verversen() }} />;
  else if (geselecteerdeLijn && !lijnData && !vertrekken.length && !lijnPoll.fout)
    lijst = <Laden />;
  else if (geselecteerdeLijn && !lijnData && !vertrekken.length && lijnPoll.fout)
    lijst = <Leeg icoon="cloud-offline-outline" titel="Volledige dienstregeling niet bereikbaar" tekst={lijnPoll.fout} knop={{ label: "Opnieuw", onPress: () => void lijnPoll.verversen() }} />;
  else if ((h || lijnData) && !vertrekken.length)
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
            {geselecteerdeLijn
              ? volgendeInRichting?.rit?.datum
                ? `Geen vertrekken meer vandaag voor lijn ${geselecteerdeLijn}. Volgende rit: ${new Date(`${volgendeInRichting.rit.datum}T12:00:00`).toLocaleDateString(taal === "en" ? "en-GB" : "nl-NL", { weekday: "long", day: "numeric", month: "long" })} om ${volgendeInRichting.gepland}.`
                : richting ? "Geen vertrekken meer vandaag in deze richting." : `Geen vertrekken meer vandaag voor lijn ${geselecteerdeLijn}.`
              : actieveModus === "alles"
                ? "Momenteel geen vertrekken in de komende tijd."
                : `Geen ${modaliteitChip(actieveModus).label.toLowerCase()}vertrekken in de komende tijd.`}
          </Text>
        </View>
      </Kaart>
    );
  else if (vertrekken.length)
    lijst = (
      <Kaart>
        {vertrekken.map((v, i) => (
          <VertrekRegel key={`${v.lijn}-${v.vertrek_ms}-${i}`} v={v} nu={nu} onPress={v.rit ? () => openRit(v) : undefined} />
        ))}
      </Kaart>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <OVspotSchermKop favoriet={fav}
        onFavoriet={() => wisselFavoriet({ id, naam, plaats })} />
      <OVspotIdentiteit naam={titel} detail={groepSub || undefined} />
      <StatusStrook
        live={!!vertrekken[0]?.live}
        vervallen={!!vertrekken[0]?.vervallen}
        afwijkingMin={vertrekken[0]?.vertraging_min ?? 0}
      />
      {meerdereModi ? (
        <View style={[s.chips, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          {tabModi.length <= 3 ? (
            <Chips<string> opties={chips} waarde={actieveModus}
              onKies={wisselModus} vol />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Chips<string> opties={chips} waarde={actieveModus}
                onKies={wisselModus} />
            </ScrollView>
          )}
        </View>
      ) : null}
      {uniekeLijnen.length >= 1 ? (
        <View style={[s.lijnFilterBalk, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          {uniekeLijnen.length > 7 ? (
            <View style={s.lijnFilterKop}>
              <Text style={[s.lijnFilterHint, { color: colors.sub }]}>
                {uniekeLijnen.length} lijnen · veeg voor meer
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(zoekveldOpen ? "Lijn zoeken sluiten" : "Lijnnummer zoeken")}
                onPress={() => {
                  setZoekveldOpen(v => !v);
                  setLijnZoektekst("");
                }}
                style={[s.lijnZoekKnop, { borderColor: colors.border }]}>
                <Ionicons name={zoekveldOpen ? "close" : "search-outline"} size={18} color={colors.accent} />
              </Pressable>
            </View>
          ) : null}
          {zoekveldOpen ? (
            <TextInput
              value={lijnZoektekst}
              onChangeText={setLijnZoektekst}
              placeholder={t("Zoek lijnnummer, bijvoorbeeld 97")}
              placeholderTextColor={colors.muted}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t("Zoek in alle lijnen van deze halte")}
              style={[s.lijnZoekveld, {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border
              }]}
            />
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.lijnFilterInhoud} accessibilityRole="tablist">
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: geselecteerdeLijn === null }}
              accessibilityLabel={t("Alle lijnen")}
              onPress={() => kiesLijn(null)}
              style={[s.lijnFilterChip, {
                backgroundColor: geselecteerdeLijn === null ? colors.accent : "transparent",
                borderColor: geselecteerdeLijn === null ? colors.accent : colors.border
              }]}>
              <Text style={[s.lijnFilterAlles, {
                color: geselecteerdeLijn === null ? colors.onAccent : colors.sub
              }]}>Alles</Text>
            </Pressable>
            {getoondeLijnChips.map(lijn => {
              const actief = geselecteerdeLijn === lijn.lijn;
              const palet = lijnKleur(
                lijn.lijn, lijn.modus, lijn.vervoerder,
                lijn.kleur, lijn.tekstkleur
              );
              return (
                <Pressable key={`${lijn.modus}:${lijn.lijn}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: actief }}
                  accessibilityLabel={t(`Filter op lijn ${lijn.lijn}`)}
                  onPress={() => kiesLijn(lijn.lijn)}
                  style={[s.lijnFilterChip, {
                    backgroundColor: actief ? colors.accent : "transparent",
                    borderColor: actief ? colors.accent : colors.border
                  }]}>
                  <View style={[s.lijnFilterBadge, { backgroundColor: palet.bg },
                    lijnBadgeHeeftRand(palet) && { borderWidth: 1, borderColor: colors.border }]}>
                    <Text style={[s.lijnFilterNummer, { color: palet.fg }]} numberOfLines={1}>
                      {lijn.lijn}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {getoondeLijnChips.length === 0 ? (
              <Text style={[s.lijnFilterHint, { color: colors.sub }]}>Geen lijnen gevonden</Text>
            ) : null}
          </ScrollView>
          {richting ? <Text style={[s.richtingLabel, { color: colors.accent }]}>
            Richting {richting.richting}
          </Text> : null}
        </View>
      ) : null}
      <ScrollView
        {...swipeResponder.panHandlers}
        contentContainerStyle={s.inhoud}
        refreshControl={<RefreshControl refreshing={ververst} onRefresh={() => {
          if (ververst) return;
          setVervers(true);
          void Promise.all([
            poll.verversen(),
            isStation ? stationPoll.verversen() : Promise.resolve(),
            geselecteerdeLijn ? lijnPoll.verversen() : Promise.resolve()
          ]).finally(() => setVervers(false));
        }} colors={[colors.accent]} />}
      >
        {storingen.length ? (
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={() => setStoringenOpen((o) => !o)}
              style={[s.storing, { backgroundColor: colors.warnBg, borderColor: colors.warnBorder }]}
              accessibilityRole="button"
              accessibilityHint={t(storingenOpen ? "Inklappen" : "Toon storingen")}
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
        {geselecteerdeLijn && !lijnData && vertrekken.length > 0 ? (
          lijnPoll.fout ? <FoutBalk tekst={t("Volledige dienstregeling niet bereikbaar")} /> :
            <Text style={[s.lijnFilterHint, { color: colors.sub }]}>Volledige dienstregeling wordt geladen…</Text>
        ) : null}
      </ScrollView>
      <LiveBalk live={!!h && !h.verouderd && vertrekken.some(v => v.live)}
        bijgewerktMs={h && Number.isFinite(Date.parse(h.bijgewerkt))
          ? Date.parse(h.bijgewerkt) : null} nu={nu} />
      <OnderBalk actief={van} />
    </View>
  );
}

const s = StyleSheet.create({
  lijnFilterBalk: { borderBottomWidth: StyleSheet.hairlineWidth },
  richtingLabel: { paddingHorizontal: 14, paddingBottom: 8, fontSize: 13, fontWeight: "700" },
  lijnFilterKop: { paddingHorizontal: 14, paddingTop: 7, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between", gap: 12 },
  lijnFilterHint: { fontSize: 12, fontWeight: "600" },
  lijnZoekKnop: { width: 34, height: 30, borderRadius: 10, borderWidth: 1,
    alignItems: "center", justifyContent: "center" },
  lijnZoekveld: { marginHorizontal: 14, marginTop: 7, height: 43, borderRadius: 12,
    borderWidth: 1, paddingHorizontal: 13, fontSize: 14 },
  lijnFilterInhoud: { paddingHorizontal: 14, paddingVertical: 9, alignItems: "center", gap: 8 },
  lijnFilterChip: {
    minHeight: 37, minWidth: 49, paddingHorizontal: 10,
    borderRadius: 19, borderWidth: 1,
    alignItems: "center", justifyContent: "center"
  },
  lijnFilterAlles: { fontSize: 13, fontWeight: "800" },
  lijnFilterBadge: {
    minWidth: 29, minHeight: 23, borderRadius: 7,
    paddingHorizontal: 6, justifyContent: "center", alignItems: "center"
  },
  lijnFilterNummer: { fontSize: 13, fontWeight: "800", maxWidth: 75 },
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
