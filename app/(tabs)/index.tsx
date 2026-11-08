import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { HalteKaart } from "../../components/HalteKaart";
import { DichtbijSkeleton } from "../../components/DichtbijSkeleton";
import { groepeerDichtbijHaltes } from "../../lib/dichtbijClusters";
import { FoutBalk, Kop, KopKnop, Leeg } from "../../components/ui";
import { useApp } from "../../context/AppProvider";
import { api } from "../../lib/api";
import { afstand } from "../../lib/format";
import { bepaalLocatieMetFallback, binnenLocatieTimeout, kiesLocatieFallback, LocatieTimeoutFout } from "../../lib/locationTimeout";
import type { LocatiePositie } from "../../lib/locationTimeout";
import { useNu, usePolling } from "../../lib/hooks";
import type { Dichtbij as DichtbijData } from "../../lib/types";

type Positie = LocatiePositie;
type LocFout = "geweigerd" | "geweigerd-blijvend" | "uit" | "timeout" | "fout";

// Een korte geheugen-cache voorkomt een leeg scherm bij terugkeer of themawisseling.
// Alleen tonen voor exact dezelfde GPS-gebiedssleutel en straal.
let vorigeHaltes: { key: string; data: DichtbijData; ts: number } | null = null;

export default function Dichtbij() {
  const { colors, instellingen, zetDichtbijIds } = useApp();
  const [pos, setPos] = useState<Positie | null>(null);
  const [locFout, setLocFout] = useState<LocFout | null>(null);
  const [zoekt, setZoekt] = useState(false);
  const laatsteLoc = useRef(0);
  const locatiePoging = useRef(0);
  const laatstePositie = useRef<Positie | null>(null);
  const nu = useNu(10_000);
  const thuis = instellingen.thuis;

  const zoekLocatie = useCallback(async () => {
    // Bij snel opnieuw proberen mag de vorige (langzame) GPS-aanroep nooit winnen.
    const poging = ++locatiePoging.current;
    const geldig = () => locatiePoging.current === poging;
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
      setLocFout(fout);
      if (!fout) laatsteLoc.current = Date.now();
    } catch (e: any) {
      if (!geldig() || e?.message === "geannuleerd") return;
      const reden: LocFout = e instanceof LocatieTimeoutFout ? "timeout"
        : (["geweigerd", "geweigerd-blijvend", "uit"].includes(e?.message) ? e.message : "fout");
      setLocFout(reden);
      // Ook onverwachte JS-fouten mogen nooit een leeg scherm of blijvende spinner geven.
      const reserve = kiesLocatieFallback(laatstePositie.current, thuis);
      laatstePositie.current = reserve;
      setPos(reserve);
    } finally {
      if (geldig()) setZoekt(false);
    }
  }, [thuis]);

  useEffect(() => {
    void zoekLocatie();
    return () => { locatiePoging.current += 1; };
  }, [zoekLocatie]);

  // Terug naar dit scherm na een paar minuten: locatie opnieuw bepalen (je kunt verplaatst zijn).
  useFocusEffect(
    useCallback(() => {
      if (laatsteLoc.current && Date.now() - laatsteLoc.current > (instellingen.databesparing ? 600_000 : 180_000)) void zoekLocatie();
    }, [zoekLocatie, instellingen.databesparing])
  );

  const key = pos ? `${pos.lat.toFixed(3)}:${pos.lon.toFixed(3)}:${instellingen.straal}` : "geen";
  const poll = usePolling(key, () => (pos
    ? binnenLocatieTimeout(() => api.dichtbij(pos.lat, pos.lon, instellingen.straal), 12_000)
        .catch(e => { if (e instanceof LocatieTimeoutFout) throw new Error("Haltes laden duurt te lang"); throw e; })
    : Promise.resolve(null)), instellingen.databesparing ? 60_000 : 20_000);
  const oudeData = vorigeHaltes && vorigeHaltes.key === key && Date.now() - vorigeHaltes.ts < 90_000
    ? vorigeHaltes.data : null;
  const gegevens = poll.data ?? oudeData;
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
    if (poll.data && key !== "geen") vorigeHaltes = { key, data: poll.data, ts: Date.now() };
  }, [key, poll.data]);

  useEffect(() => {
    if (haltes.length) zetDichtbijIds(haltes.map((h) => h.id));
  }, [haltes, zetDichtbijIds]);

  const plaats = haltes.find((h) => h.plaats)?.plaats;
  const bronTekst = pos?.bron === "standaard" ? "Standaardlocatie · Amsterdam Centraal"
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
  } else if (!pos || (poll.laden && !gegevens)) {
    inhoud = <DichtbijSkeleton locatie={!!pos} />;
  } else if (!haltes.length && gegevens) {
    inhoud = (
      <Leeg
        icoon="bus-outline"
        titel={`Geen haltes binnen ${afstand(instellingen.straal)}`}
        tekst="Vergroot de afstand in Instellingen of zoek een halte."
        knop={{ label: "Naar instellingen", onPress: () => router.navigate("/instellingen") }}
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
          accessibilityLabel="Zoek halte, lijn of plaats"
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
        <View style={s.titelRij}>
          <Text style={[s.titel, { color: colors.text }]} accessibilityRole="header">
            Haltes binnen {afstand(instellingen.straal)}
          </Text>
          {pos ? (
            <View style={[s.locatieChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="location-sharp" size={12} color={colors.accent} />
              <Text style={[s.bron, { color: colors.sub }]} numberOfLines={1}>{bronTekst}</Text>
            </View>
          ) : null}
        </View>
        {locFout && pos ? (
          <FoutBalk tekst={pos.bron === "standaard"
            ? "GPS niet beschikbaar. Haltes bij Amsterdam Centraal worden getoond; probeer je locatie opnieuw."
            : pos.bron === "thuis"
              ? "GPS niet beschikbaar. Haltes bij je ingestelde thuislocatie worden getoond."
              : "Nieuwe GPS-positie niet beschikbaar. Je ziet je laatst bekende locatie."} />
        ) : null}
        {poll.fout && gegevens ? <FoutBalk tekst={poll.fout} /> : null}
        {inhoud}
        {meerFout ? <FoutBalk tekst={meerFout} /> : null}
        {heeftMeer && gegevens ? (
          <Pressable
            disabled={meerLaden}
            onPress={() => void laadMeer()}
            style={[s.meerKnop, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={meerLaden ? "Meer haltes laden" : "Meer haltes binnen de ingestelde afstand tonen"}
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
  titel: { fontSize: 18, fontWeight: "700", letterSpacing: -0.2, flexShrink: 1 },
  bron: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  locatieChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, maxWidth: "49%" },
  meerKnop: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  meerTekst: { fontSize: 14, fontWeight: "700" }
});
