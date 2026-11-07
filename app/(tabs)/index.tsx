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
import { binnenLocatieTimeout, kiesLocatieFallback, LocatieTimeoutFout, vindGpsPositie } from "../../lib/locationTimeout";
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
  const nu = useNu(10_000);
  const thuis = instellingen.thuis;

  const zoekLocatie = useCallback(async () => {
    // Bij snel opnieuw proberen mag de vorige (langzame) GPS-aanroep nooit winnen.
    const poging = ++locatiePoging.current;
    const geldig = () => locatiePoging.current === poging;
    setZoekt(true);
    try {
      // Eén deadline voor alle native stappen, ook vastgelopen permissie-/provider-promises.
      // Laatste bekende GPS is primair; een nieuwe GPS-fix wordt alleen gevraagd als die ontbreekt.
      const positie = await binnenLocatieTimeout(
        (signal) => vindGpsPositie(Location, Location.Accuracy.Balanced, signal)
      );
      if (!geldig()) return;
      setPos(positie);
      setLocFout(null);
      laatsteLoc.current = Date.now();
    } catch (e: any) {
      if (!geldig() || e?.message === "geannuleerd") return;
      const reden: LocFout = e instanceof LocatieTimeoutFout ? "timeout"
        : (["geweigerd", "geweigerd-blijvend", "uit"].includes(e?.message) ? e.message : "fout");
      setLocFout(reden);
      // Altijd een bruikbare positie: eerdere GPS > thuislocatie > Amsterdam Centraal.
      setPos(oud => kiesLocatieFallback(oud, thuis));
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
      if (laatsteLoc.current && Date.now() - laatsteLoc.current > 180_000) void zoekLocatie();
    }, [zoekLocatie])
  );

  const key = pos ? `${pos.lat.toFixed(3)}:${pos.lon.toFixed(3)}:${instellingen.straal}` : "geen";
  const poll = usePolling(key, () => (pos
    ? binnenLocatieTimeout(() => api.dichtbij(pos.lat, pos.lon, instellingen.straal), 12_000)
        .catch(e => { if (e instanceof LocatieTimeoutFout) throw new Error("Haltes laden duurt te lang"); throw e; })
    : Promise.resolve(null)), 20_000);
  const oudeData = vorigeHaltes && vorigeHaltes.key === key && Date.now() - vorigeHaltes.ts < 90_000
    ? vorigeHaltes.data : null;
  const gegevens = poll.data ?? oudeData;
  const haltes = gegevens?.haltes ?? [];
  // Alleen de Dichtbij-weergave clustert; alle originele IDs blijven beschikbaar
  // voor storingen, ritlinks en de afzonderlijke halteborden.
  const halteGroepen = useMemo(() => groepeerDichtbijHaltes(gegevens?.haltes ?? []), [gegevens?.haltes]);

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
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              void zoekLocatie();
              void poll.verversen();
            }}
            colors={[colors.accent]}
          />
        }
      >
        <View style={s.titelRij}>
          <Text style={[s.titel, { color: colors.text }]} accessibilityRole="header">
            Haltes in de buurt
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
  locatieChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12, maxWidth: "49%" }
});
