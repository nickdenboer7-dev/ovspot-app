import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { HalteKaart } from "../../components/HalteKaart";
import { FoutBalk, Kop, KopKnop, Leeg, Laden } from "../../components/ui";
import { useApp } from "../../context/AppProvider";
import { api } from "../../lib/api";
import { afstand } from "../../lib/format";
import { useNu, usePolling } from "../../lib/hooks";

type Positie = { lat: number; lon: number; bron: "gps" | "thuis" };
type LocFout = "geweigerd" | "geweigerd-blijvend" | "uit" | "fout";

export default function Dichtbij() {
  const { colors, instellingen, zetDichtbijIds } = useApp();
  const [pos, setPos] = useState<Positie | null>(null);
  const [locFout, setLocFout] = useState<LocFout | null>(null);
  const [zoekt, setZoekt] = useState(false);
  const laatsteLoc = useRef(0);
  const nu = useNu(10_000);
  const thuis = instellingen.thuis;

  const zoekLocatie = useCallback(async () => {
    setZoekt(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error(perm.canAskAgain ? "geweigerd" : "geweigerd-blijvend");
      if (!(await Location.hasServicesEnabledAsync())) throw new Error("uit");
      const snel = await Location.getLastKnownPositionAsync({ maxAge: 120_000, requiredAccuracy: 300 });
      if (snel) setPos({ lat: snel.coords.latitude, lon: snel.coords.longitude, bron: "gps" });
      const precies = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPos({ lat: precies.coords.latitude, lon: precies.coords.longitude, bron: "gps" });
      setLocFout(null);
      laatsteLoc.current = Date.now();
    } catch (e: any) {
      const reden = (["geweigerd", "geweigerd-blijvend", "uit"].includes(e?.message) ? e.message : "fout") as LocFout;
      setLocFout(reden);
      setPos((oud) => (oud && oud.bron === "gps" ? oud : thuis ? { lat: thuis.lat, lon: thuis.lon, bron: "thuis" } : null));
    } finally {
      setZoekt(false);
    }
  }, [thuis]);

  useEffect(() => {
    void zoekLocatie();
  }, [zoekLocatie]);

  // Terug naar dit scherm na een paar minuten: locatie opnieuw bepalen (je kunt verplaatst zijn).
  useFocusEffect(
    useCallback(() => {
      if (laatsteLoc.current && Date.now() - laatsteLoc.current > 180_000) void zoekLocatie();
    }, [zoekLocatie])
  );

  const key = pos ? `${pos.lat.toFixed(3)}:${pos.lon.toFixed(3)}:${instellingen.straal}` : "geen";
  const poll = usePolling(key, () => (pos ? api.dichtbij(pos.lat, pos.lon, instellingen.straal) : Promise.resolve(null)), 20_000);
  const haltes = poll.data?.haltes ?? [];

  useEffect(() => {
    if (haltes.length) zetDichtbijIds(haltes.map((h) => h.id));
  }, [haltes, zetDichtbijIds]);

  const plaats = haltes.find((h) => h.plaats)?.plaats;
  const bronTekst = pos?.bron === "thuis" ? `Thuislocatie · ${thuis?.naam ?? ""}` : plaats ? `Op je locatie · ${plaats}` : "Op je locatie";

  let inhoud: React.ReactNode;
  if (!pos && locFout) {
    inhoud = (
      <Leeg
        icoon="location-outline"
        titel={locFout === "uit" ? "Locatie staat uit" : "Geen toegang tot je locatie"}
        tekst="Zet locatie aan om haltes dichtbij te zien, of kies een thuislocatie in Instellingen."
        knop={
          locFout === "geweigerd-blijvend"
            ? { label: "Open instellingen", onPress: () => Linking.openSettings() }
            : locFout === "uit"
              ? { label: "Opnieuw proberen", onPress: () => void zoekLocatie() }
              : { label: "Locatie toestaan", onPress: () => void zoekLocatie() }
        }
      />
    );
  } else if (!pos || (poll.laden && !poll.data)) {
    inhoud = <Laden />;
  } else if (!haltes.length && poll.data) {
    inhoud = (
      <Leeg
        icoon="bus-outline"
        titel={`Geen haltes binnen ${afstand(instellingen.straal)}`}
        tekst="Vergroot de afstand in Instellingen of zoek een halte."
        knop={{ label: "Naar instellingen", onPress: () => router.navigate("/instellingen") }}
      />
    );
  } else if (!poll.data && poll.fout) {
    inhoud = <Leeg icoon="cloud-offline-outline" titel="Kan vertrektijden niet laden" tekst={poll.fout} knop={{ label: "Opnieuw", onPress: () => void poll.verversen() }} />;
  } else {
    inhoud = haltes.map((h) => (
      <HalteKaart
        key={h.id}
        id={h.id}
        naam={h.naam}
        sub={afstand(h.afstand_m)}
        modi={h.modi}
        vertrekken={h.vertrekken}
        storingen={h.storingen_aantal ?? 0}
        fout={h.fout}
        nu={nu}
        van="index"
        plaats={h.plaats}
      />
    ));
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Kop groot titel="OVspot" rechts={<KopKnop icoon={zoekt ? "locate" : "location-outline"} label="Locatie vernieuwen" onPress={() => void zoekLocatie()} />} />
      <View style={[s.zoekStrook, { backgroundColor: colors.surface }]}>
        <Pressable
          onPress={() => router.push("/zoek")}
          style={[s.zoekbalk, { backgroundColor: colors.surface2 }]}
          accessibilityRole="search"
          accessibilityLabel="Zoek halte, lijn of plaats"
        >
          <Ionicons name="search" size={22} color={colors.sub} />
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
            Dichtbij
          </Text>
          {pos ? (
            <Text style={[s.bron, { color: colors.sub }]} numberOfLines={1}>
              {bronTekst}
            </Text>
          ) : null}
        </View>
        {poll.fout && poll.data ? <FoutBalk tekst={poll.fout} /> : null}
        {inhoud}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  zoekStrook: { paddingHorizontal: 16, paddingVertical: 12 },
  zoekbalk: { height: 50, borderRadius: 25, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18 },
  zoekText: { fontSize: 17 },
  lijst: { padding: 12, paddingTop: 16, gap: 12, paddingBottom: 24 },
  titelRij: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4, gap: 12 },
  titel: { fontSize: 24, fontWeight: "800", letterSpacing: -0.3 },
  bron: { fontSize: 13, flexShrink: 1, textAlign: "right" }
});
