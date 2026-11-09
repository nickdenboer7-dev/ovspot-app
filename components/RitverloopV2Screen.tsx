import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./LocalizedText";
import { isTab, OnderBalk } from "./OnderBalk";
import { LiveRitKaart } from "./LiveRitKaart";
import { FeedbackModal } from "./FeedbackModal";
import { HalteVouwknop, RitverloopStop } from "./RitverloopStop";
import { useApp } from "../context/AppProvider";
import { api } from "../lib/api";
import { bestemmingVoorWeergave, isTrein } from "../lib/format";
import { geldigeRitPositie, markeerRitHaltes } from "../lib/liveRitKaart";
import { useNu, usePolling } from "../lib/hooks";
import { afwijkingTekst, bouwRitV2Haltes, compacteHalteNaam, isGpsActueel, projecteerGpsOpRit, ritGpsStatus, RITV2, zichtbaarKomendeHaltes } from "../lib/ritverloopV2";
import type { LiveRitVoertuigAntwoord } from "../lib/types";

type Params = {
  trip?: string; datum?: string; voertuig?: string; van?: string; lijn?: string;
  bestemming?: string; vervoerder?: string; modus?: string; instap_halte?: string;
  instap_naam?: string; instap_ms?: string; richting?: string;
};
const P = RITV2;

function KopKnop({ icon, label, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void
}) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    hitSlop={4} style={s.kopKnop}>
    <Ionicons name={icon} size={23} color="#FFFFFF" />
  </Pressable>;
}

export default function RitverloopV2Screen() {
  const p = useLocalSearchParams<Params>();
  const van = isTab(p.van) ? p.van : "index";
  const insets = useSafeAreaInsets();
  const { t, instellingen, isFavoriet, wisselFavoriet, zetFeedbackContext } = useApp();
  const [toonEerder, setToonEerder] = useState(false);
  const [toonLater, setToonLater] = useState(false);
  const [lijstHoogte, setLijstHoogte] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [weergave, setWeergave] = useState<"lijst" | "kaart">("lijst");
  const lijstRef = useRef<ScrollView>(null);
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
  const segment = rit && actueel && !rit.vervallen && !trein
    ? projecteerGpsOpRit(rit, gps) : null;
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
  const vanaf = toonEerder || volgendeIndex < 1 ? 0 : volgendeIndex - 1;
  const aantalKomende = zichtbaarKomendeHaltes(
    lijstHoogte, volgendeIndex > 0, !toonEerder && volgendeIndex > 1);
  const tot = toonLater || volgendeIndex < 0 ? haltes.length
    : Math.min(haltes.length, volgendeIndex + aantalKomende);
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
  const favStop = volgendeRij?.h ?? null;
  const fav = favStop ? isFavoriet(favStop.id) : false;
  const paar = segment && haltes[segment.vorigeIndex] && haltes[segment.volgendeIndex]
    ? compacteHalteNaam(haltes[segment.vorigeIndex].h.naam, haltes[segment.vorigeIndex].plaats)
      + " " + t("en") + " " + haltes[segment.volgendeIndex].naam : "";
  const status = rit?.vervallen ? t("Vervalt") :
    segment ? t("Onderweg") : rit?.live ? t("Live tijden") : t("Gepland");
  const bronMs = rit?.bijgewerkt ? Date.parse(rit.bijgewerkt) : NaN;
  const bijgewerktMs = Number.isFinite(bronMs) ? bronMs : poll.laatsteOk?.getTime() ?? 0;
  const leeftijdS = bijgewerktMs ? Math.max(0, Math.floor((nu - bijgewerktMs) / 1000)) : null;
  const kaartHaltes = useMemo(() => markeerRitHaltes(rit?.stops, rit?.haltes || []),
    [rit?.stops, rit?.haltes]);

  useEffect(() => {
    setToonEerder(false); setToonLater(false);
    lijstRef.current?.scrollTo({ y: 0, animated: false });
  }, [rit?.id, rit?.datum]);
  useEffect(() => {
    if (rit?.id && rit.datum) zetFeedbackContext({ view: "rit", rit_id: rit.id, rit_datum: rit.datum });
  }, [rit?.id, rit?.datum, zetFeedbackContext]);

  return <View style={s.scherm}>
    <StatusBar style="light" />
    <View style={[s.boven, { paddingTop: insets.top }]}>
      <View style={s.kop}>
        <KopKnop icon="arrow-back" label={t("Terug")} onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/")} />
        <Text style={s.titel} accessibilityRole="header">OVspot</Text>
        <KopKnop icon={fav ? "star" : "star-outline"}
          label={fav ? t("Verwijder uit favorieten") : t("Bewaar als favoriet")}
          onPress={() => favStop && wisselFavoriet({
            id: favStop.id, naam: favStop.naam, plaats: favStop.plaats })} />
        <KopKnop icon="ellipsis-vertical" label={t("Meer")} onPress={() => setMenuOpen(v => !v)} />
      </View>
      {menuOpen ? <View style={[s.menu, { top: insets.top + 52 }]}>
        <Pressable style={s.menuItem} accessibilityRole="button"
          onPress={() => { setMenuOpen(false); setFeedbackOpen(true); }}>
          <Text style={s.menuTekst}>{t("Feedback sturen")}</Text>
        </Pressable>
        <Pressable style={s.menuItem} accessibilityRole="button"
          onPress={() => { setMenuOpen(false); router.navigate("/instellingen"); }}>
          <Text style={s.menuTekst}>{t("Instellingen")}</Text>
        </Pressable>
      </View> : null}
    </View>
    <View style={s.lijnrij}>
      <View style={s.badge}><Text style={s.badgeTekst}>{lijn || "OV"}</Text></View>
      <View style={s.lijnInhoud}>
        <Text style={s.bestemming} numberOfLines={1}>{t("naar")} {bestemming}</Text>
        <Text style={s.vervoerder} numberOfLines={1}>{vervoerder}</Text>
      </View>
      <Pressable style={s.kaartKnop} accessibilityRole="button"
        accessibilityLabel={t(isKaart ? "Bekijk haltelijst" : "Toon de live voertuigkaart")}
        disabled={!kaartBeschikbaar} onPress={() => setWeergave(isKaart ? "lijst" : "kaart")}>
        <Ionicons name={isKaart ? "list-outline" : "map-outline"} size={23}
          color={kaartBeschikbaar ? P.navy : P.pastDot} />
      </Pressable>
    </View>

    {!isKaart ? <>
      <View style={s.status}>
        <View style={s.statusRegel}>
          <Text style={s.statusTitel} numberOfLines={1}>{status}</Text>
          {statusAfwijkingMin !== null ? (
            <Text style={[
              s.statusAfwijking,
              { color: statusAfwijkingMin > 0 ? P.delay :
                  statusAfwijkingMin < 0 ? P.early : P.green }
            ]} numberOfLines={1}>
              · {t(afwijkingTekst(statusAfwijkingMin))}
            </Text>
          ) : null}
          <View style={s.statusSpacer} />
          <View style={[s.gpsChip, { backgroundColor: gpsStatus === "GPS actueel" ? P.gpsBg : P.staleBg }]}>
            <Text style={[s.gpsTekst, { color: gpsStatus === "GPS actueel" ? P.green : P.muted }]}
              numberOfLines={1}>{t(gpsStatus)}</Text>
          </View>
        </View>
        <Text style={s.tussen} numberOfLines={1}>
          {paar ? t("Tussen") + " " + paar
            : gpsStatus === "GPS niet op route" ? t("Voertuigpositie niet op haltevolgorde")
            : t("Geen actuele voertuigpositie")}
        </Text>
      </View>
      <ScrollView ref={lijstRef} style={s.lijst}
        contentContainerStyle={s.lijstInhoud}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setLijstHoogte(v => Math.abs(v - h) < 1 ? v : h);
        }}>
        {!rit ? <Text style={s.fout}>{poll.laden ? t("Laden…") :
          poll.fout || t("Rit niet gevonden")}</Text> : null}
        {rit && verborgenEerder > 0 ? (
          <HalteVouwknop label={t("Toon") + " " + verborgenEerder + " " + t("eerdere haltes")}
            onPress={() => setToonEerder(true)} />
        ) : null}
        {rit && toonEerder && volgendeIndex > 1 ? (
          <HalteVouwknop label={t("Verberg eerdere haltes")} omhoog
            onPress={() => setToonEerder(false)} />
        ) : null}
        {getoond.map(r => {
          const height = r.index === volgendeIndex ? 64 : 48;
          const prevHeight = r.index - 1 === volgendeIndex ? 64 : 48;
          return <RitverloopStop key={r.h.id + "-" + r.index}
            r={r} volgende={r.index === volgendeIndex}
            laatste={r.index === haltes.length - 1} nu={nu} t={t}
            hoogte={height} vorigeHoogte={prevHeight} trein={trein}
            fractie={segment && actueel && r.index === segment.volgendeIndex &&
              segment.vorigeIndex >= vanaf ? segment.fractie : null} />;
        })}
        {rit && verborgenLater > 0 ? (
          <HalteVouwknop label={t("Toon") + " " + verborgenLater + " " + t("volgende haltes")}
            onPress={() => setToonLater(true)} />
        ) : null}
        {rit && toonLater && volgendeIndex >= 0 && tot === haltes.length &&
          haltes.length - volgendeIndex > 6 ? (
          <HalteVouwknop label={t("Verberg volgende haltes")} omhoog
            onPress={() => setToonLater(false)} />
        ) : null}
      </ScrollView>
      <View style={s.liveFooter}>
        <View style={s.liveDot} />
        <Text style={s.liveFooterTekst}>
          {rit?.live ? t("Live") : t("Gepland")} · {leeftijdS !== null
            ? t("bijgewerkt") + " " + leeftijdS + " " + t("s geleden")
            : t("nog niet bijgewerkt")}
        </Text>
      </View>
      <OnderBalk actief={van} compact />
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
  scherm: { flex: 1, backgroundColor: "#FFFFFF" },
  boven: { backgroundColor: P.navy, zIndex: 15 },
  kop: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 6 },
  titel: { flex: 1, fontSize: 20, fontWeight: "800", color: "#FFFFFF", paddingLeft: 10 },
  kopKnop: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },
  menu: { position: "absolute", right: 8, backgroundColor: "#FFFFFF",
    borderRadius: 10, width: 200, elevation: 7, borderWidth: 1, borderColor: "#C5CCD6" },
  menuItem: { minHeight: 44, justifyContent: "center", paddingHorizontal: 15 },
  menuTekst: { color: P.ink, fontSize: 14, fontWeight: "600" },
  lijnrij: { height: 60, flexDirection: "row", alignItems: "center",
    backgroundColor: "#FFFFFF", paddingHorizontal: 12, gap: 10 },
  badge: { minWidth: 49, maxWidth: 73, height: 42, backgroundColor: P.pale,
    borderRadius: 9, justifyContent: "center", alignItems: "center", paddingHorizontal: 8 },
  badgeTekst: { color: P.navy, fontSize: 17, fontWeight: "800" },
  lijnInhoud: { flex: 1, minWidth: 0, gap: 2 },
  bestemming: { fontSize: 17, fontWeight: "700", color: P.ink },
  vervoerder: { fontSize: 12, color: P.muted },
  kaartKnop: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  status: { height: 56, backgroundColor: P.strip,
    paddingHorizontal: 12, paddingVertical: 5, justifyContent: "center", gap: 3 },
  statusRegel: { height: 22, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  statusTitel: { fontSize: 15, fontWeight: "700", color: P.ink, flexShrink: 1 },
  statusAfwijking: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
  statusSpacer: { flex: 1 },
  gpsChip: { borderRadius: 10, minHeight: 22, paddingHorizontal: 8,
    justifyContent: "center", flexShrink: 0 },
  gpsTekst: { fontSize: 11, fontWeight: "700" },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: P.greenDot },
  tussen: { fontSize: 13, color: "#3D4858" },
  lijst: { flex: 1, backgroundColor: "#FFFFFF" },
  lijstInhoud: { paddingHorizontal: 10, paddingBottom: 8 },
  liveFooter: { height: 32, backgroundColor: "#F3F5F8", borderTopWidth: 1,
    borderTopColor: "#E0E5EC", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 7 },
  liveFooterTekst: { fontSize: 12, color: "#3D4858" },
  fout: { padding: 18, fontSize: 14, color: P.muted }
});
