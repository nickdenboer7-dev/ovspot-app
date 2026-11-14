import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../components/LocalizedText";
import { HalteKaart } from "../../components/HalteKaart";
import { DichtbijSkeleton } from "../../components/DichtbijSkeleton";
import { KorteUitleg } from "../../components/KorteUitleg";
import { groepeerDichtbijHaltes } from "../../lib/dichtbijClusters";
import { kiesAnker, leesBewaardeLijst, leesBewaardePositie, magOudeLijstTonen, OUD_NOG_LIVE_MS } from "../../lib/dichtbijStart";
import type { BewaardeLijst } from "../../lib/dichtbijStart";
import { FoutBalk, Kop, KopKnop, Leeg } from "../../components/ui";
import { useApp } from "../../context/AppProvider";
import { api } from "../../lib/api";
import { afstand } from "../../lib/format";
import { bepaalLocatieMetFallback, binnenLocatieTimeout, kiesLocatieFallback, LocatieTimeoutFout } from "../../lib/locationTimeout";
import type { LocatiePositie } from "../../lib/locationTimeout";
import { GPS_HERSTEL_INTERVAL_MS, magGpsAutomatischHerstellen, moetGpsBijTerugkeerVernieuwd } from "../../lib/gpsRecovery";
import { useNu, usePolling } from "../../lib/hooks";
import type { Dichtbij as DichtbijData } from "../../lib/types";

type Positie = LocatiePositie;
type LocFout = "geweigerd" | "geweigerd-blijvend" | "uit" | "timeout" | "fout";

// De laatste lijst voorkomt een leeg scherm bij openen, terugkeer of een kleine verplaatsing.
// Alleen tonen als hij recent is, van vlakbij komt en bij dezelfde afstand-instelling hoort.
let vorigeHaltes: BewaardeLijst<DichtbijData> | null = null;
const START_POSITIE_SLEUTEL = "ovspot_dichtbij_positie_v1";
const START_LIJST_SLEUTEL = "ovspot_dichtbij_lijst_v1";

export default function Dichtbij() {
  const { colors, instellingen, zetDichtbijIds, t, uitlegZichtbaar, sluitUitleg } = useApp();
  const [pos, setPos] = useState<Positie | null>(null);
  const [locFout, setLocFout] = useState<LocFout | null>(null);
  const [zoekt, setZoekt] = useState(false);
  const laatsteLoc = useRef(0);
  const locatiePoging = useRef(0);
  const zoektRef = useRef(false);
  const locFoutRef = useRef<LocFout | null>(null);
  const laatsteAutoHerstel = useRef(0);
  const laatstePositie = useRef<Positie | null>(null);
  // Voorlopig: we tonen de bewaarde positie van de vorige keer terwijl de GPS nog zoekt.
  const [voorlopig, setVoorlopig] = useState(false);
  const startGelezen = useRef(false);
  const ankerRef = useRef<Positie | null>(null);
  const nu = useNu(10_000);
  const thuis = instellingen.thuis;

  const zoekLocatie = useCallback(async () => {
    // Bij snel opnieuw proberen mag de vorige (langzame) GPS-aanroep nooit winnen.
    const poging = ++locatiePoging.current;
    const geldig = () => locatiePoging.current === poging;
    zoektRef.current = true;
    setZoekt(true);
    try {
      // Ook een hangende native GPS-promise eindigt na maximaal 4 seconden met een fallback.
      const reserve = kiesLocatieFallback(laatstePositie.current, thuis);
      const { positie, fout } = await bepaalLocatieMetFallback(
        Location, Location.Accuracy.Balanced, reserve
      );
      if (!geldig()) return;
      laatstePositie.current = positie;
      setPos(positie);
      setVoorlopig(false);
      locFoutRef.current = fout;
      setLocFout(fout);
      if (!fout) {
        laatsteLoc.current = Date.now();
        if (positie.bron === "gps") {
          AsyncStorage.setItem(START_POSITIE_SLEUTEL,
            JSON.stringify({ lat: positie.lat, lon: positie.lon, t: Date.now() })).catch(() => {});
        }
      }
    } catch (e: any) {
      if (!geldig() || e?.message === "geannuleerd") return;
      const reden: LocFout = e instanceof LocatieTimeoutFout ? "timeout"
        : (["geweigerd", "geweigerd-blijvend", "uit"].includes(e?.message) ? e.message : "fout");
      locFoutRef.current = reden;
      setLocFout(reden);
      // Ook onverwachte JS-fouten mogen nooit een leeg scherm of blijvende spinner geven.
      const reserve = kiesLocatieFallback(laatstePositie.current, thuis);
      laatstePositie.current = reserve;
      setPos(reserve);
      setVoorlopig(false);
    } finally {
      if (geldig()) {
        zoektRef.current = false;
        setZoekt(false);
      }
    }
  }, [thuis]);

  useEffect(() => {
    let weg = false;
    const start = () => { if (!weg) void zoekLocatie(); };
    if (startGelezen.current) {
      start();
    } else {
      // Eerst (enkele ms) de bewaarde positie en lijst van de vorige keer lezen, zodat Dichtbij
      // direct iets toont terwijl de GPS nog zoekt. De focus-controle wacht daar even op.
      zoektRef.current = true;
      Promise.race([
        AsyncStorage.multiGet([START_POSITIE_SLEUTEL, START_LIJST_SLEUTEL]),
        new Promise<null>(klaar => setTimeout(() => klaar(null), 400))
      ]).then(rijen => {
        if (weg || startGelezen.current || !rijen) return;
        const nu = Date.now();
        const lijst = leesBewaardeLijst<DichtbijData>(rijen[1]?.[1] ?? null, nu);
        if (lijst && !vorigeHaltes) vorigeHaltes = lijst;
        const bewaard = leesBewaardePositie(rijen[0]?.[1] ?? null, nu);
        if (bewaard && !laatstePositie.current) {
          const begin: Positie = { lat: bewaard.lat, lon: bewaard.lon, bron: "gps" };
          laatstePositie.current = begin;
          setPos(begin);
          setVoorlopig(true);
        }
      }).catch(() => {}).then(() => {
        if (weg) return;
        startGelezen.current = true;
        start();
      });
    }
    return () => { weg = true; locatiePoging.current += 1; };
  }, [zoekLocatie]);

  // Een GPS-fout mag niet blijven staan tot de gebruiker op het locatie-icoon tikt.
  // Android stuurt ook een 'focus'-event wanneer het snelle-instellingenpaneel sluit:
  // zo merken we dat locatievoorzieningen weer zijn ingeschakeld zonder een herstart.
  // Als Android dat event mist, probeert een begrensde timer het bij een bestaande fout.
  useFocusEffect(
    useCallback(() => {
      const controleerBijTerugkeer = (naAndroidPaneel = false) => {
        if (AppState.currentState !== "active" || zoektRef.current) return;
        const nu = Date.now();
        if (nu - laatsteAutoHerstel.current < 2_000) return;
        const normaalInterval = instellingen.databesparing ? 600_000 : 180_000;
        if (moetGpsBijTerugkeerVernieuwd(
          locFoutRef.current, laatsteLoc.current, nu,
          naAndroidPaneel ? 15_000 : normaalInterval
        )) {
          laatsteAutoHerstel.current = nu;
          void zoekLocatie();
        }
      };
      controleerBijTerugkeer();
      const foreground = AppState.addEventListener("change", toestand => {
        if (toestand === "active") controleerBijTerugkeer(true);
      });
      const androidShade = AppState.addEventListener("focus", () => controleerBijTerugkeer(true));
      const timer = setInterval(() => {
        if (AppState.currentState === "active" && !zoektRef.current
          && magGpsAutomatischHerstellen(locFoutRef.current)) {
          controleerBijTerugkeer();
        }
      }, GPS_HERSTEL_INTERVAL_MS);
      return () => {
        clearInterval(timer);
        foreground.remove();
        androidShade.remove();
      };
    }, [zoekLocatie, instellingen.databesparing])
  );

  // De sleutel hangt aan een anker dat pas na ~100 m verschuift: GPS-ruis of een paar passen
  // laden de lijst dus niet opnieuw. Het ophalen zelf gebruikt wel steeds de nieuwste positie.
  ankerRef.current = kiesAnker(ankerRef.current, pos);
  const anker = ankerRef.current;
  const key = anker ? `${anker.lat.toFixed(3)}:${anker.lon.toFixed(3)}:${instellingen.straal}` : "geen";
  const poll = usePolling(key, () => (pos
    ? binnenLocatieTimeout(() => api.dichtbij(pos.lat, pos.lon, instellingen.straal), 12_000)
        .then(data => ({ key, data }))
        .catch(e => { if (e instanceof LocatieTimeoutFout) throw new Error("Haltes laden duurt te lang"); throw e; })
    : Promise.resolve(null)), instellingen.databesparing ? 60_000 : 20_000);
  const nieuweData = poll.data?.key === key ? poll.data.data : null;
  const wisseltSleutel = poll.data !== null && poll.data.key !== key;
  const oudeLijst = vorigeHaltes && magOudeLijstTonen(vorigeHaltes, anker, instellingen.straal, key, Date.now())
    ? vorigeHaltes.data : null;
  // De lijst van de vorige keer is een tussenstand. Is hij ouder dan een halve minuut, dan blijven
  // de tijden staan maar wordt niets meer als live gemarkeerd.
  const oudNogLive = !!vorigeHaltes && Date.now() - vorigeHaltes.ts < OUD_NOG_LIVE_MS;
  const oudeData = useMemo(() => (!oudeLijst || oudNogLive ? oudeLijst : {
    ...oudeLijst,
    haltes: oudeLijst.haltes.map(h => ({ ...h, vertrekken: h.vertrekken.map(v => ({ ...v, live: false })) }))
  }), [oudeLijst, oudNogLive]);
  const gegevens = nieuweData ?? oudeData;
  // Paginering voorkomt een limiet op de eerste 8 haltes en houdt het laden snel.
  // Bij verder scrollen worden de volgende GTFS-haltes binnen dezelfde radius opgehaald.
  const [vervolg, setVervolg] = useState<{
    key: string; haltes: DichtbijData["haltes"]; heeft_meer: boolean; volgende_offset: number | null;
  } | null>(null);
  const [meerLaden, setMeerLaden] = useState(false);
  const [meerFout, setMeerFout] = useState<string | null>(null);
  const paginaBezig = useRef(false);
  const actueleKey = useRef(key);
  actueleKey.current = key;
  const heeftMeer = vervolg?.key === key ? vervolg.heeft_meer : !!gegevens?.heeft_meer;
  const volgendeOffset = vervolg?.key === key ? vervolg.volgende_offset : gegevens?.volgende_offset;
  const haltes = useMemo(() => {
    const items = [...(gegevens?.haltes ?? []), ...(vervolg?.key === key ? vervolg.haltes : [])];
    return [...new Map(items.map(item => [item.id, item])).values()]
      .sort((a, b) => a.afstand_m - b.afstand_m);
  }, [gegevens?.haltes, vervolg, key]);
  // Alleen de Dichtbij-weergave clustert; alle originele IDs blijven beschikbaar
  // voor storingen, ritlinks en de afzonderlijke halteborden.
  const halteGroepen = useMemo(() => groepeerDichtbijHaltes(haltes), [haltes]);

  const laadMeer = useCallback(async () => {
    if (!pos || !heeftMeer || volgendeOffset == null || paginaBezig.current) return;
    paginaBezig.current = true;
    setMeerLaden(true);
    const begonnenMet = key;
    try {
      const pagina = await binnenLocatieTimeout(
        () => api.dichtbij(pos.lat, pos.lon, instellingen.straal, volgendeOffset), 12_000
      );
      if (actueleKey.current !== begonnenMet) return;
      setVervolg(oud => {
        const bewaarde = oud?.key === begonnenMet ? oud.haltes : [];
        const uniek = new Map([...bewaarde, ...pagina.haltes].map(item => [item.id, item]));
        return {
          key: begonnenMet,
          haltes: [...uniek.values()],
          heeft_meer: !!pagina.heeft_meer,
          volgende_offset: pagina.volgende_offset ?? null
        };
      });
      setMeerFout(null);
    } catch (e: any) {
      if (actueleKey.current === begonnenMet) {
        setMeerFout(e?.message || "Meer haltes laden lukt nu niet");
      }
    } finally {
      paginaBezig.current = false;
      setMeerLaden(false);
    }
  }, [pos, key, instellingen.straal, heeftMeer, volgendeOffset]);

  useEffect(() => {
    if (nieuweData && key !== "geen" && anker) {
      vorigeHaltes = { key, data: nieuweData, ts: Date.now(), lat: anker.lat, lon: anker.lon, straal: instellingen.straal };
      AsyncStorage.setItem(START_LIJST_SLEUTEL, JSON.stringify(vorigeHaltes)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nieuweData]);

  useEffect(() => {
    if (haltes.length) zetDichtbijIds(haltes.map((h) => h.id));
  }, [haltes, zetDichtbijIds]);

  const plaats = haltes.find((h) => h.plaats)?.plaats;
  const bronTekst = voorlopig && zoekt ? "Locatie bijwerken…"
    : pos?.bron === "standaard" ? "Standaardlocatie · Amsterdam Centraal"
    : pos?.bron === "thuis" ? (thuis?.plaats || thuis?.naam || "Thuislocatie")
    : (plaats || "Huidige locatie");

  let inhoud: React.ReactNode;
  if (!pos && locFout) {
    inhoud = (
      <Leeg
        icoon="location-outline"
        titel={locFout === "uit" ? "Locatie staat uit"
          : locFout === "timeout" ? "Locatie duurt te lang"
          : locFout === "geweigerd" || locFout === "geweigerd-blijvend"
            ? "Geen toegang tot je locatie" : "Locatie niet beschikbaar"}
        tekst={locFout === "timeout"
          ? "Geen GPS-positie binnen 5 seconden. Probeer opnieuw of kies een thuislocatie in Instellingen."
          : "Zet locatie aan om haltes dichtbij te zien, of kies een thuislocatie in Instellingen."}
        knop={
          locFout === "geweigerd-blijvend"
            ? { label: "Open instellingen", onPress: () => Linking.openSettings() }
            : locFout === "uit"
              ? { label: "Opnieuw proberen", onPress: () => void zoekLocatie() }
              : { label: locFout === "geweigerd" ? "Locatie toestaan" : "Opnieuw proberen",
                onPress: () => void zoekLocatie() }
        }
      />
    );
  } else if (!pos || (!gegevens && (poll.laden || wisseltSleutel))) {
    inhoud = <DichtbijSkeleton locatie={!!pos} />;
  } else if (!haltes.length && gegevens) {
    inhoud = (
      <Leeg
        icoon="bus-outline"
        titel={`Geen haltes binnen ${afstand(instellingen.straal)}`}
        tekst="OVspot toont haltes in Nederland. Ben je ergens anders, zoek dan een Nederlandse halte om de app te proberen. Of vergroot de afstand in Instellingen."
        knop={{ label: "Zoek een halte", onPress: () => router.push("/zoek") }}
      />
    );
  } else if (!gegevens && poll.fout) {
    inhoud = <Leeg icoon="cloud-offline-outline" titel="Kan vertrektijden niet laden" tekst={poll.fout} knop={{ label: "Opnieuw", onPress: () => void poll.verversen() }} />;
  } else {
    inhoud = halteGroepen.map((h) => (
      <HalteKaart
        key={h.id}
        id={h.id}
        naam={h.naam}
        sub={afstand(h.afstand_m)}
        modi={h.modi}
        vertrekken={h.vertrekken.map((x) => x.vertrek)}
        toonVertrekken={instellingen.toonVertrekpreviews}
        gecombineerdeVertrekken={h.haltes.length > 1 ? h.vertrekken : undefined}
        aantalHaltepalen={h.haltes.length}
        storingen={h.storingen_aantal}
        fout={h.fout}
        nu={nu}
        van="index"
        plaats={h.plaats}
      />
    ));
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Kop groot titel="Dichtbij" rechts={<KopKnop icoon={zoekt ? "locate" : "location-outline"} label="Locatie vernieuwen" onPress={() => void zoekLocatie()} />} />
      <View style={[s.zoekStrook, { backgroundColor: colors.header, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.push("/zoek")}
          style={[s.zoekbalk, { backgroundColor: colors.surface2 }]}
          accessibilityRole="search"
          accessibilityLabel={t("Zoek halte, lijn of plaats")}
        >
          <Ionicons name="search-outline" size={20} color={colors.sub} />
          <Text style={[s.zoekText, { color: colors.sub }]}>Zoek halte, lijn of plaats</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={s.lijst}
        scrollEventThrottle={250}
        onScroll={({ nativeEvent }) => {
          const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
          if (heeftMeer && !meerLaden && contentOffset.y > 0
            && layoutMeasurement.height + contentOffset.y >= contentSize.height - 240) {
            void laadMeer();
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              setVervolg(null);
              setMeerFout(null);
              void zoekLocatie();
              void poll.verversen();
            }}
            colors={[colors.accent]}
          />
        }
      >
        <View style={[s.titelRij, instellingen.groteTekst && s.titelRijGroteTekst]}>
          <Text style={[s.titel, instellingen.groteTekst && s.titelGroteTekst, { color: colors.text }]} accessibilityRole="header">
            {pos?.bron === "standaard"
              ? "Haltes bij Amsterdam Centraal"
              : `Haltes binnen ${afstand(instellingen.straal)}`}
          </Text>
          {pos && pos.bron !== "standaard" ? (
            <View style={[s.locatieChip, instellingen.groteTekst && s.locatieChipGroteTekst, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="location-sharp" size={12} color={colors.accent} />
              <Text style={[s.bron, { color: colors.sub }]} numberOfLines={1}>{bronTekst}</Text>
            </View>
          ) : null}
        </View>
        {pos?.bron === "standaard" ? (
          <View style={[s.fallbackKaart, { backgroundColor: colors.infoBg, borderColor: colors.border }]}>
            <View style={s.fallbackKop}>
              <Ionicons name="information-circle-outline" size={20} color={colors.infoText} />
              <Text style={[s.fallbackTitel, { color: colors.infoText }]}>
                Vervangende locatie · Amsterdam Centraal
              </Text>
            </View>
            <Text style={[s.fallbackUitleg, { color: colors.body }]}>
              Je locatie is niet beschikbaar. Dit zijn haltes bij Amsterdam Centraal, niet bij jou in de buurt.
            </Text>
            <View style={s.fallbackActies}>
              <Pressable onPress={() => router.push("/zoek")}
                accessibilityRole="button" accessibilityLabel={t("Andere halte zoeken")}
                style={[s.fallbackZoekKnop, { backgroundColor: colors.accent }]}>
                <Ionicons name="search-outline" size={17} color={colors.onAccent} />
                <Text style={[s.fallbackZoekTekst, { color: colors.onAccent }]}>
                  Andere halte zoeken
                </Text>
              </Pressable>
              <Pressable onPress={() => locFout === "geweigerd-blijvend"
                  ? Linking.openSettings() : void zoekLocatie()}
                disabled={zoekt && locFout !== "geweigerd-blijvend"}
                accessibilityRole="button"
                accessibilityLabel={t(locFout === "geweigerd-blijvend"
                  ? "Open instellingen" : "GPS opnieuw proberen")}
                accessibilityState={{ disabled: zoekt && locFout !== "geweigerd-blijvend" }}
                style={[s.fallbackGpsKnop, { borderColor: colors.border,
                  opacity: zoekt && locFout !== "geweigerd-blijvend" ? 0.6 : 1 }]}>
                <Ionicons name={locFout === "geweigerd-blijvend"
                  ? "settings-outline" : "locate-outline"} size={17} color={colors.infoText} />
                <Text style={[s.fallbackGpsTekst, { color: colors.infoText }]}>
                  {locFout === "geweigerd-blijvend" ? "Open instellingen"
                    : zoekt ? "Locatie bepalen…" : "GPS opnieuw proberen"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : locFout && pos ? (
          <FoutBalk tekst={pos.bron === "thuis"
            ? "GPS niet beschikbaar. Haltes bij je ingestelde thuislocatie worden getoond."
            : "Nieuwe GPS-positie niet beschikbaar. Je ziet je laatst bekende locatie."} />
        ) : null}
        {uitlegZichtbaar ? <KorteUitleg onSluit={sluitUitleg} /> : null}
        {poll.fout && gegevens ? <FoutBalk tekst={poll.fout} /> : null}
        {inhoud}
        {meerFout ? <FoutBalk tekst={meerFout} /> : null}
        {heeftMeer && gegevens ? (
          <Pressable
            disabled={meerLaden}
            onPress={() => void laadMeer()}
            style={[s.meerKnop, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t(meerLaden ? "Meer haltes laden" : "Meer haltes binnen de ingestelde afstand tonen")}
          >
            <Ionicons name={meerLaden ? "ellipsis-horizontal" : "chevron-down"} size={19} color={colors.accent} />
            <Text style={[s.meerTekst, { color: colors.accent }]}>
              {meerLaden ? "Meer haltes laden…" : `Meer haltes binnen ${afstand(instellingen.straal)} tonen`}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  zoekStrook: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  zoekbalk: { height: 49, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 15 },
  zoekText: { fontSize: 15 },
  lijst: { padding: 14, paddingTop: 17, gap: 12, paddingBottom: 26 },
  titelRij: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2, gap: 10, marginBottom: 1 },
  // Met vergrote tekst krijgt de locatienaam een eigen regel. De kop blijft volledig leesbaar.
  titelRijGroteTekst: { flexWrap: "wrap", rowGap: 7 },
  titel: { fontSize: 18, fontWeight: "700", letterSpacing: -0.2, flexShrink: 1 },
  titelGroteTekst: { width: "100%" },
  bron: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  locatieChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, maxWidth: "49%" },
  locatieChipGroteTekst: { marginLeft: "auto", maxWidth: "100%" },
  fallbackKaart: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 9 },
  fallbackKop: { flexDirection: "row", alignItems: "center", gap: 8 },
  fallbackTitel: { fontSize: 15, fontWeight: "700", flex: 1 },
  fallbackUitleg: { fontSize: 13, lineHeight: 19 },
  fallbackActies: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  fallbackZoekKnop: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderRadius: 10, paddingHorizontal: 12, gap: 6 },
  fallbackZoekTekst: { fontSize: 13, fontWeight: "700" },
  fallbackGpsKnop: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, gap: 6 },
  fallbackGpsTekst: { fontSize: 13, fontWeight: "600" },
  meerKnop: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  meerTekst: { fontSize: 14, fontWeight: "700" }
});
