import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./LocalizedText";
import { isTab, OnderBalk } from "./OnderBalk";
import { LiveRitKaart } from "./LiveRitKaart";
import { FeedbackModal } from "./FeedbackModal";
import { OVspotSchermKop, OVspotIdentiteit } from "./OVspotSchermKop";
import { StatusStrook } from "./StatusStrook";
import { LijnBadge } from "./ui";
import { LiveBalk } from "./LiveBalk";
import { jouwHalteIndex, tijdTotVertrek, toonVolgendeHighlight, vertrekHalteOmschrijving } from "../lib/ritStatus";
import { HalteVouwknop, RitverloopStop } from "./RitverloopStop";
import { useApp } from "../context/AppProvider";
import { api } from "../lib/api";
import { maakLijnFavoriet } from "../lib/favorieten";
import { bestemmingVoorWeergave, isTrein, spoorLabel } from "../lib/format";
import { geldigeRitPositie, markeerRitHaltes } from "../lib/liveRitKaart";
import { useNu, usePolling } from "../lib/hooks";
import { bouwRitV2Haltes, compacteHalteNaam, isGpsActueel, projecteerGpsOpRit, ritGpsStatus, ritNummerKort, vorigeRitDelen, voertuigRegel, zichtbaarKomendeHaltes } from "../lib/ritverloopV2";
import type { LiveRitVoertuigAntwoord } from "../lib/types";

type Params = {
  trip?: string; datum?: string; voertuig?: string; van?: string; lijn?: string;
  bestemming?: string; vervoerder?: string; modus?: string; instap_halte?: string;
  instap_naam?: string; instap_plaats?: string; instap_ms?: string; richting?: string;
  kleur?: string; tekstkleur?: string;
};

function KopKnop({ icon, label, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void
}) {
  const { colors } = useApp();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    hitSlop={4} style={s.kopKnop}>
    <Ionicons name={icon} size={23} color={colors.headerText} />
  </Pressable>;
}

export default function RitverloopV2Screen() {
  const p = useLocalSearchParams<Params>();
  const van = isTab(p.van) ? p.van : "index";
  const insets = useSafeAreaInsets();
  const { t, colors, instellingen, isFavoriet, wisselFavoriet, isLijnFavoriet, wisselLijnFavoriet, zetFeedbackContext } = useApp();
  const [toonEerder, setToonEerder] = useState(false);
  const [toonLater, setToonLater] = useState(false);
  const [lijstHoogte, setLijstHoogte] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [weergave, setWeergave] = useState<"lijst" | "kaart">("lijst");
  const lijstRef = useRef<ScrollView>(null);
  const eenmaalGesprongenNaarHalte = useRef<string | null>(null);
  const nu = useNu(1000);
  const ref = {
    trip: p.trip ? String(p.trip) : undefined,
    datum: p.datum ? String(p.datum) : undefined,
    voertuig: p.voertuig ? String(p.voertuig) : undefined,
    instap_halte: p.instap_halte ? String(p.instap_halte) : undefined,
    instap_naam: p.instap_naam ? String(p.instap_naam) : undefined,
    instap_ms: p.instap_ms && Number.isFinite(Number(p.instap_ms)) ? Number(p.instap_ms) : undefined,
    richting: p.richting ? String(p.richting) : undefined
  };
  const poll = usePolling(
    "ritV2:" + [ref.trip, ref.datum, ref.voertuig, ref.instap_halte, ref.instap_ms, ref.richting].join(":"),
    () => api.rit(ref),
    d => instellingen.databesparing ? (d?.live ? 15000 : 60000) : (d?.live ? 5000 : 30000)
  );
  const rit = poll.data;
  const trein = isTrein(rit?.modus || String(p.modus || ""));
  const kaartBeschikbaar = !!rit && !trein && !rit.vervallen;
  const isKaart = weergave === "kaart" && kaartBeschikbaar;
  const gpsPoll = usePolling<LiveRitVoertuigAntwoord | null>(
    "ritV2gps:" + rit?.id + ":" + rit?.datum,
    () => rit && rit.id && rit.datum && !trein && instellingen.liveVoertuigen
      ? api.liveRitVoertuig(rit.id, rit.datum) : Promise.resolve(null),
    instellingen.databesparing ? 15000 : 5000
  );
  const gps = rit && gpsPoll.data ? geldigeRitPositie(gpsPoll.data, rit.id, rit.datum) : null;
  // A transient request failure is not a stale GPS fix: evaluate the source timestamp.
  // Keep one vehicle request and one cached fix when switching map <-> stop list.
  const actueel = isGpsActueel(gps, nu);
  const segment = useMemo(
    () => rit && actueel && !rit.vervallen && !trein
      ? projecteerGpsOpRit(rit, gps) : null,
    [rit, actueel, gps?.timestamp, gps?.lat, gps?.lon, trein]
  );
  const gpsStatus = ritGpsStatus(gps, nu, !!segment, {
    trein, enabled: instellingen.liveVoertuigen, laden: gpsPoll.laden
  });
  const haltes = useMemo(() => rit ? bouwRitV2Haltes(rit, segment?.vorigeIndex ?? null) : [],
    [rit, segment?.vorigeIndex]);
  const gpsCursor = segment?.volgendeIndex ?? -1;
  const fallbackCursor = rit?.nu_hier?.volgende_index ?? -1;
  const kandidaat = gpsCursor >= 0 ? gpsCursor : fallbackCursor;
  const volgendeIndex = kandidaat >= 0 && kandidaat < haltes.length && !haltes[kandidaat].h.vervalt
    ? kandidaat : haltes.findIndex(h => !h.gepasseerd && !h.h.vervalt);
  const rijdend = toonVolgendeHighlight(!!segment && actueel,
    !!rit && !rit.vervallen && rit.rit_status !== "SCHEDULED" &&
    rit.rit_status !== "ARRIVED");
  const instapIndex = jouwHalteIndex(
    haltes.map(r => ({ id: r.h.id, naam: r.h.naam })),
    ref.instap_halte, ref.instap_naam
  );
  const richtIndex = instapIndex >= 0 ? instapIndex : volgendeIndex;
  const vanaf = toonEerder || richtIndex < 1 ? 0 : richtIndex - 1;
  const aantalKomende = zichtbaarKomendeHaltes(
    lijstHoogte, richtIndex > 0, !toonEerder && richtIndex > 1);
  const totInVoorbeeld = richtIndex < 0 ? haltes.length
    : Math.min(haltes.length, richtIndex + aantalKomende);
  const tot = toonLater ? haltes.length : totInVoorbeeld;
  const getoond = haltes.slice(vanaf, tot);
  const verborgenEerder = vanaf;
  const verborgenLater = haltes.length - tot;
  const lijn = String(rit?.lijn || p.lijn || "");
  const bestemming = bestemmingVoorWeergave(lijn, String(rit?.bestemming || p.bestemming || ""));
  const vervoerder = String(rit?.vervoerder || p.vervoerder || "");
  const volgendeRij = haltes[volgendeIndex] ?? null;
  // De status toont exact de op deze regel al eenmaal afgeronde afwijking.
  const statusAfwijkingMin = rit?.live && volgendeRij && !volgendeRij.h.vervalt
    ? volgendeRij.vertragingMin : null;
  const gekozenInstap = ref.instap_halte ? haltes.find(({ h }) => h.id === ref.instap_halte)?.h : undefined;
  const lijnFavoriet = ref.instap_halte ? maakLijnFavoriet({
    halte: {
      id: ref.instap_halte,
      naam: ref.instap_naam || gekozenInstap?.naam || "",
      plaats: p.instap_plaats || gekozenInstap?.plaats || ""
    },
    lijn: String(p.lijn || rit?.lijn || ""),
    richting: String(ref.richting || p.bestemming || rit?.bestemming || ""),
    modus: String(p.modus || rit?.modus || ""),
    vervoerder: String(p.vervoerder ?? rit?.vervoerder ?? ""),
    kleur: p.kleur || rit?.route_color,
    tekstkleur: p.tekstkleur
  }) : null;
  // Ritten die zonder vertrekbord zijn geopend behouden hun haltefavoriet.
  const favStop = ref.instap_halte ? null : volgendeRij?.h;
  const fav = lijnFavoriet ? isLijnFavoriet(lijnFavoriet.id) : !!favStop && isFavoriet(favStop.id);
  const onFavoriet = lijnFavoriet ? () => wisselLijnFavoriet(lijnFavoriet) : favStop
    ? () => wisselFavoriet({ id: favStop.id, naam: favStop.naam, plaats: favStop.plaats }) : undefined;
  const paar = segment && haltes[segment.vorigeIndex] && haltes[segment.volgendeIndex]
    ? compacteHalteNaam(haltes[segment.vorigeIndex].h.naam, haltes[segment.vorigeIndex].plaats)
      + " " + t("en") + " " + haltes[segment.volgendeIndex].naam : "";
  const eerste = haltes[0] ?? null;
  const nogNietVertrokken = !rijdend && !!rit && !rit.vervallen &&
    (rit.rit_status === "SCHEDULED" ||
      (!!eerste && (eerste.verwachtMs ?? 0) > nu && !eerste.gepasseerd));
  const eersteNaam = eerste?.h.naam || "";
  const perron = eerste ? spoorLabel(rit?.modus || "bus", eerste.h.spoor) : "";
  const vertrekVanaf = vertrekHalteOmschrijving(eersteNaam, perron);
  const tijdVanaf = eerste?.verwacht || eerste?.gepland || "";
  const vertrekOver = eerste ? tijdTotVertrek(eerste.verwachtMs, nu) : "";
  const geplandeStatus = nogNietVertrokken
    ? `${t("Gepland")} · ${t("vertrekt")} ${tijdVanaf} ${t("vanaf")} ${vertrekVanaf}` +
      (vertrekOver && vertrekOver !== "Vertrokken" ? ` · ${vertrekOver}` : "")
    : undefined;
  const bronMs = rit?.bijgewerkt ? Date.parse(rit.bijgewerkt) : NaN;
  const bijgewerktMs = Number.isFinite(bronMs) ? bronMs : null;
  const bijHalteNaam = !nogNietVertrokken && !paar && !!rit && !rit.vervallen && !trein &&
    !!rit.nu_hier?.bij_halte && volgendeRij ? volgendeRij.naam : "";
  const voertuigInfo = voertuigRegel(rit, gps);
  const ritNr = !trein && !!rit && !rit.vervallen ? ritNummerKort(rit.rit_nummer) : "";
  const vorige = !trein && !!rit && !rit.vervallen ? vorigeRitDelen(rit.vorige_rit) : null;
  const voertuigDelen = [
    ritNr ? `${t("Rit")} ${ritNr}` : "",
    voertuigInfo ? `${t("Voertuig")} ${voertuigInfo.nummer}` : ""
  ].filter(Boolean);
  const voertuigTekst = voertuigDelen.length ? voertuigDelen.join(" · ") : undefined;
  const snelheidTekst = voertuigInfo && voertuigInfo.snelheidKmh !== null
    ? `${voertuigInfo.snelheidKmh} km/h` : undefined;
  const liveVoorBalk = !!rit && rit.live && !rit.vervallen &&
    haltes.some(h => h.live);

  const kaartHaltes = useMemo(() => markeerRitHaltes(rit?.stops, rit?.haltes || []),
    [rit?.stops, rit?.haltes]);

  useEffect(() => {
    setToonEerder(false); setToonLater(false);
    eenmaalGesprongenNaarHalte.current = null;
  }, [rit?.id, rit?.datum]);
  useEffect(() => {
    if (rit?.id && rit.datum) zetFeedbackContext({ view: "rit", rit_id: rit.id, rit_datum: rit.datum });
  }, [rit?.id, rit?.datum, zetFeedbackContext]);

  return <View style={[s.scherm, { backgroundColor: colors.background }]}>
    <View style={[s.boven, { backgroundColor: colors.header }]}>
      <OVspotSchermKop titel="Ritverloop" favoriet={fav}
        favorietLabel={lijnFavoriet ? (fav ? "Verwijder lijnfavoriet" : "Bewaar lijn, richting en instaphalte") : undefined}
        onFavoriet={onFavoriet}
        meer={<KopKnop icon="ellipsis-vertical" label={t("Meer")}
          onPress={() => setMenuOpen(v => !v)} />}
      />
      {menuOpen ? <View style={[s.menu, { backgroundColor: colors.surface, borderColor: colors.border, top: insets.top + 72 }]}>
        <Pressable style={s.menuItem} accessibilityRole="button"
          onPress={() => { setMenuOpen(false); setFeedbackOpen(true); }}>
          <Text style={[s.menuTekst, { color: colors.text }]}>{t("Feedback sturen")}</Text>
        </Pressable>
        <Pressable style={s.menuItem} accessibilityRole="button"
          onPress={() => { setMenuOpen(false); router.navigate("/instellingen"); }}>
          <Text style={[s.menuTekst, { color: colors.text }]}>{t("Instellingen")}</Text>
        </Pressable>
      </View> : null}
    </View>
    <OVspotIdentiteit
      naam={bestemming} lijn={lijn || "OV"} modus={rit?.modus || String(p.modus || "bus")}
      vervoerder={vervoerder} kleur={p.kleur ? String(p.kleur) : undefined}
      tekstkleur={p.tekstkleur ? String(p.tekstkleur) : undefined}
      detail={vervoerder}
      actie={
        <Pressable style={s.kaartKnop} accessibilityRole="button"
          accessibilityLabel={t(isKaart ? "Bekijk haltelijst" : "Toon de live voertuigkaart")}
          disabled={!kaartBeschikbaar} onPress={() => setWeergave(isKaart ? "lijst" : "kaart")}>
          <Ionicons name={isKaart ? "list-outline" : "map-outline"} size={23}
            color={kaartBeschikbaar ? colors.accent : colors.muted} />
        </Pressable>
      }
    />

    {!isKaart ? <>
      <StatusStrook
        live={!!volgendeRij?.live}
        vervallen={!!rit?.vervallen}
        afwijkingMin={statusAfwijkingMin ?? 0}
        tekst={geplandeStatus}
        voertuig={voertuigTekst}
        snelheid={snelheidTekst}
        plat
        chip={nogNietVertrokken ? "Geen voertuig-GPS" : !trein ? gpsStatus : undefined}
        tussen={nogNietVertrokken ? undefined :
          paar ? `${t("Tussen")} ${paar}` :
          bijHalteNaam ? `${t("Halteert op")} ${bijHalteNaam}` :
          rijdend ? t("Onderweg") : undefined}
      />
      <ScrollView ref={lijstRef} style={[s.lijst, { backgroundColor: colors.background }]}
        contentContainerStyle={s.lijstInhoud}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setLijstHoogte(v => Math.abs(v - h) < 1 ? v : h);
        }}>
        {vorige ? (
          <View style={s.eerderRij} accessible accessibilityRole="text">
            <Text style={[s.eerderLabel, { color: colors.sub }]}>{t("Reed eerder als")}</Text>
            <LijnBadge lijn={vorige.lijn} modus="bus" vervoerder={vervoerder}
              kleur={vorige.lijn === lijn ? (p.kleur ? String(p.kleur) : rit?.route_color) : undefined} />
            {vorige.bestemming ? <Text style={[s.eerderBestemming, { color: colors.body }]} numberOfLines={1}>
              {vorige.bestemming}</Text> : null}
          </View>
        ) : null}
        <View style={[s.tijdlijnKaart, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {!rit ? <Text style={[s.fout, { color: colors.sub }]}>{poll.laden ? t("Laden…") :
          poll.fout || t("Rit niet gevonden")}</Text> : null}
        {rit && verborgenEerder > 0 ? (
          <HalteVouwknop label={t("Toon") + " " + verborgenEerder + " " + t("eerdere haltes")}
            onPress={() => setToonEerder(true)} />
        ) : null}
        {rit && toonEerder && richtIndex > 1 ? (
          <HalteVouwknop label={t("Verberg eerdere haltes")} omhoog
            onPress={() => setToonEerder(false)} />
        ) : null}
        {getoond.map(r => {
          const height = r.index === volgendeIndex && rijdend ? 64 : 48;
          const prevHeight = r.index - 1 === volgendeIndex && rijdend ? 64 : 48;
          const isJouwHalte = instapIndex >= 0 && r.index === instapIndex;
          return <RitverloopStop key={r.h.id + "-" + r.index}
            r={r} volgende={rijdend && r.index === volgendeIndex}
            jouwHalte={isJouwHalte}
            vertrekhalte={nogNietVertrokken && r.index === 0}
            onLayout={isJouwHalte && !!ref.instap_halte ? e => {
              const uniekeSleutel = [rit?.id, rit?.datum, ref.instap_halte].join(":");
              if (eenmaalGesprongenNaarHalte.current === uniekeSleutel) return;
              eenmaalGesprongenNaarHalte.current = uniekeSleutel;
              lijstRef.current?.scrollTo({
                y: Math.max(0, e.nativeEvent.layout.y - 110), animated: false
              });
            } : undefined}
            laatste={r.index === haltes.length - 1} nu={nu} t={t}
            hoogte={height} vorigeHoogte={prevHeight} trein={trein}
            fractie={segment && actueel && rijdend && r.index === segment.volgendeIndex &&
              segment.vorigeIndex >= vanaf ? segment.fractie : null} />;
        })}
        {rit && verborgenLater > 0 ? (
          <HalteVouwknop label={t("Toon") + " " + verborgenLater + " " + t("volgende haltes")}
            onPress={() => setToonLater(true)} />
        ) : null}
        {rit && toonLater && totInVoorbeeld < haltes.length ? (
          <HalteVouwknop label={t("Verberg volgende haltes")} omhoog
            onPress={() => setToonLater(false)} />
        ) : null}
        </View>
      </ScrollView>
      <LiveBalk live={liveVoorBalk} bijgewerktMs={bijgewerktMs} nu={nu} />
      <OnderBalk actief={van} />
    </> : rit ? <LiveRitKaart
      key={rit.id + ":" + rit.datum} ritId={rit.id} datum={rit.datum}
      positie={actueel ? gps : null}
      lijnnummer={rit.lijn} volgendeHalte={rit.nu_hier?.volgende_naam || bestemming}
      vertragingMin={rit.vertraging_min} shape={rit.shape} stops={kaartHaltes}
      routeColor={rit.route_color} onderRuimte={insets.bottom + 12}
      onLijst={() => setWeergave("lijst")} /> : null}
    <FeedbackModal zichtbaar={feedbackOpen} onSluit={() => setFeedbackOpen(false)}
      context={rit ? { view: "rit", rit_id: rit.id, rit_datum: rit.datum } : undefined} />
  </View>;
}

const s = StyleSheet.create({
  scherm: { flex: 1 },
  boven: { zIndex: 15 },
  kopKnop: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  menu: { position: "absolute", right: 14, borderRadius: 16, width: 216, elevation: 7, borderWidth: 1 },
  menuItem: { minHeight: 44, justifyContent: "center", paddingHorizontal: 15 },
  menuTekst: { fontSize: 14, fontWeight: "600" },
  lijnrij: { height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 10 },
  badge: { minWidth: 49, maxWidth: 73, height: 42,
    borderRadius: 9, justifyContent: "center", alignItems: "center", paddingHorizontal: 8 },
  badgeTekst: { fontSize: 17, fontWeight: "800" },
  lijnInhoud: { flex: 1, minWidth: 0, gap: 2 },
  bestemming: { fontSize: 17, fontWeight: "700" },
  vervoerder: { fontSize: 12 },
  kaartKnop: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  status: { height: 56,
    paddingHorizontal: 12, paddingVertical: 5, justifyContent: "center", gap: 3 },
  statusRegel: { height: 22, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  statusTitel: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  statusAfwijking: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
  statusSpacer: { flex: 1 },
  gpsChip: { borderRadius: 10, minHeight: 22, paddingHorizontal: 8,
    justifyContent: "center", flexShrink: 0 },
  gpsTekst: { fontSize: 11, fontWeight: "700" },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  tussen: { fontSize: 13 },
  lijst: { flex: 1 },
  lijstInhoud: { paddingHorizontal: 0, paddingTop: 4, paddingBottom: 18 },
  tijdlijnKaart: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16, paddingVertical: 4, overflow: "visible" },
  eerderRij: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  eerderLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  eerderBestemming: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
  liveFooter: { height: 32, borderTopWidth: 1,
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 7 },
  liveFooterTekst: { fontSize: 12 },
  fout: { padding: 18, fontSize: 14 }
});
