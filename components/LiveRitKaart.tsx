import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type MapView from "react-native-maps";
import { api } from "../lib/api";
import { geldigeRitPositie, LIVE_MAP_ANIMATION_MS, LIVE_MAP_POLL_MS } from "../lib/liveRitKaart";
import type { LiveRitPositie } from "../lib/types";
import { useApp } from "../context/AppProvider";

type MapsModule = typeof import("react-native-maps");

/** Oudere preview-APK's bevatten nog geen native mapmodule.
 * Dynamisch laden voorkomt een crash door de OTA op deze installaties.
 */
function nativeMaps(): MapsModule | null {
  if (Platform.OS !== "android") return null;
  // Build 1 is de bestaande OTA-only APK zonder native maps. Build 2 en
  // hoger worden met react-native-maps en Google API-key gecompileerd.
  // Expo SDK 57 Fabric registreert MapView niet altijd via UIManager.
  if (Number(Constants.nativeBuildVersion || 0) < 2) return null;
  try {
    return require("react-native-maps") as MapsModule;
  } catch {
    return null;
  }
}

function NativeKaart({ maps, positie }: { maps: MapsModule; positie: LiveRitPositie }) {
  const Map = maps.default;
  const { PROVIDER_GOOGLE } = maps;
  const MarkerAnimated = maps.Marker.Animated;
  const mapRef = useRef<MapView>(null);
  const [coordinate] = useState(() => new maps.AnimatedRegion({
    latitude: positie.lat, longitude: positie.lon,
    latitudeDelta: 0.009, longitudeDelta: 0.009
  }));

  useEffect(() => {
    coordinate.timing({
      latitude: positie.lat, longitude: positie.lon,
      latitudeDelta: 0.009, longitudeDelta: 0.009,
      duration: LIVE_MAP_ANIMATION_MS, useNativeDriver: false
    } as unknown as Parameters<typeof coordinate.timing>[0]).start();

    mapRef.current?.animateCamera({
      center: { latitude: positie.lat, longitude: positie.lon }
    }, { duration: LIVE_MAP_ANIMATION_MS });
  }, [coordinate, positie.lat, positie.lon, positie.timestamp]);

  return (
    <Map ref={mapRef} provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      mapType="standard"
      initialRegion={{
        latitude: positie.lat, longitude: positie.lon,
        latitudeDelta: 0.009, longitudeDelta: 0.009
      }}
      scrollEnabled={false} pitchEnabled={false} zoomEnabled={false}
      rotateEnabled={false} toolbarEnabled={false}
    >
      <MarkerAnimated
        coordinate={coordinate as unknown as { latitude: number; longitude: number }}
        flat={true} anchor={{ x: 0.5, y: 0.5 }}
        rotation={positie.richting ?? 0}
        tracksViewChanges={false}
      >
        <View style={s.voertuigMarker}>
          <Ionicons name="navigate" color="#fff" size={20} />
        </View>
      </MarkerAnimated>
    </Map>
  );
}

type Props = { ritId: string; datum: string; actief?: boolean };

export function LiveRitKaart({ ritId, datum, actief = true }: Props) {
  const { colors } = useApp();
  const [positie, setPositie] = useState<LiveRitPositie | null>(null);
  const maps = useMemo(nativeMaps, []);

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
      } catch {
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

  // Nooit een willekeurige bus tonen wanneer de NDOV-koppeling niet uniek is.
  if (!actief || !positie) return null;

  if (!maps) {
    return (
      <View style={[s.nietBeschikbaar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="map-outline" size={19} color={colors.sub} />
        <Text style={{ color: colors.sub, fontSize: 12, flex: 1 }}>
          Live kaart beschikbaar na installatie van de nieuwe Android-appversie.
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.kaart, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <NativeKaart key={ritId} maps={maps} positie={positie} />
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
  nietBeschikbaar: { borderWidth: 1, borderRadius: 12, padding: 12,
    flexDirection: "row", alignItems: "center", gap: 8 },
  kop: { position: "absolute", top: 9, left: 9, borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row",
    alignItems: "center", gap: 6, maxWidth: "92%" },
  kopText: { fontWeight: "700", fontSize: 12 },
  voertuigMarker: { backgroundColor: "#185c98", borderWidth: 2, borderColor: "#fff",
    width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" }
});
