import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { AnimatedRegion, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { api } from "../lib/api";
import { geldigeRitPositie, LIVE_MAP_ANIMATION_MS, LIVE_MAP_POLL_MS } from "../lib/liveRitKaart";
import type { LiveRitPositie } from "../lib/types";
import { useApp } from "../context/AppProvider";

function NativeKaart({ positie }: { positie: LiveRitPositie }) {
  const mapRef = useRef<MapView>(null);
  const [coordinate] = useState(() => new AnimatedRegion({
    latitude: positie.lat,
    longitude: positie.lon,
    latitudeDelta: 0.009,
    longitudeDelta: 0.009
  }));

  useEffect(() => {
    try {
      coordinate.timing({
        latitude: positie.lat, longitude: positie.lon,
        latitudeDelta: 0.009, longitudeDelta: 0.009,
        duration: LIVE_MAP_ANIMATION_MS, useNativeDriver: false
      } as unknown as Parameters<typeof coordinate.timing>[0]).start();

      mapRef.current?.animateCamera({
        center: { latitude: positie.lat, longitude: positie.lon }
      }, { duration: LIVE_MAP_ANIMATION_MS });
    } catch (error) {
      console.error("[LiveRitKaart] Native Google Maps-animatie mislukt", error);
      throw error;
    }
  }, [coordinate, positie.lat, positie.lon, positie.timestamp]);

  return (
    <MapView ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      mapType="standard"
      initialRegion={{
        latitude: positie.lat, longitude: positie.lon,
        latitudeDelta: 0.009, longitudeDelta: 0.009
      }}
      scrollEnabled={false} pitchEnabled={false} zoomEnabled={false}
      rotateEnabled={false} toolbarEnabled={false}
    >
      <Marker.Animated
        coordinate={coordinate as unknown as { latitude: number; longitude: number }}
        flat={true} anchor={{ x: 0.5, y: 0.5 }}
        rotation={positie.richting ?? 0}
        tracksViewChanges={false}
      >
        <View style={s.voertuigMarker}>
          <Ionicons name="navigate" color="#fff" size={20} />
        </View>
      </Marker.Animated>
    </MapView>
  );
}

type Props = { ritId: string; datum: string; actief?: boolean };

export function LiveRitKaart({ ritId, datum, actief = true }: Props) {
  const { colors } = useApp();
  const [positie, setPositie] = useState<LiveRitPositie | null>(null);

  useEffect(() => {
    if (!actief || !ritId || !datum) {
      setPositie(null);
      return;
    }
    let afgesloten = false;
    let bezig = false;
    setPositie(null);

    async function ophalen() {
      if (bezig) return;
      bezig = true;
      try {
        const response = await api.liveRitVoertuig(ritId, datum);
        if (!afgesloten) setPositie(geldigeRitPositie(response, ritId, datum));
      } catch (error) {
        console.error("[LiveRitKaart] NDOV-voertuigpositie niet opgehaald", error);
        if (!afgesloten) setPositie(prev =>
          prev && Date.now() / 1000 - prev.timestamp <= 180 ? prev : null);
      } finally {
        bezig = false;
      }
    }

    void ophalen();
    const interval = setInterval(() => void ophalen(), LIVE_MAP_POLL_MS);
    return () => {
      afgesloten = true;
      clearInterval(interval);
    };
  }, [ritId, datum, actief]);

  // Zonder verse, unieke NDOV/GTFS-koppeling geen fictieve voertuiglocatie tonen.
  if (!actief || !positie) return null;

  return (
    <View style={[s.kaart, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <NativeKaart key={ritId} positie={positie} />
      <View style={[s.kop, { backgroundColor: colors.surface }]}>
        <Ionicons name="navigate-circle" size={16} color={colors.live} />
        <Text style={[s.kopText, { color: colors.text }]} numberOfLines={1}>
          Live voertuig · lijn {positie.lijnnummer}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  kaart: { height: 250, overflow: "hidden", borderRadius: 16, borderWidth: 1 },
  kop: { position: "absolute", top: 9, left: 9, borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row",
    alignItems: "center", gap: 6, maxWidth: "92%" },
  kopText: { fontWeight: "700", fontSize: 12 },
  voertuigMarker: { backgroundColor: "#185c98", borderWidth: 2, borderColor: "#fff",
    width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }
});
