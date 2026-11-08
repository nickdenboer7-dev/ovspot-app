import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Platform, StyleSheet, Text, UIManager, View } from "react-native";
import type MapView from "react-native-maps";
import { api } from "../lib/api";
import { geldigeRitPositie, LIVE_MAP_ANIMATION_MS, LIVE_MAP_POLL_MS, wereldPixels } from "../lib/liveRitKaart";
import type { LiveRitPositie } from "../lib/types";
import { useApp } from "../context/AppProvider";

type MapsModule = typeof import("react-native-maps");

/** OTA-veilig: oudere APK's hebben de native MapView nog niet ingebouwd.
 * Gebruik dan OSM-tegels met een ingebouwde Animated-voertuigmarker.
 */
function nativeMaps(): MapsModule | null {
  if (Platform.OS !== "android") return null;
  try {
    if (!UIManager.getViewManagerConfig?.("AIRMap")
        && !UIManager.getViewManagerConfig?.("RNMapsMapView")) return null;
    return require("react-native-maps") as MapsModule;
  } catch {
    return null;
  }
}

function VoertuigIcoon({ richting }: { richting: number | null }) {
  const { colors } = useApp();
  return (
    <View style={[s.voertuigMarker, { backgroundColor: colors.accent, borderColor: "#fff" }]}>
      <Ionicons name="navigate" color="#fff" size={19}
        style={{ transform: [{ rotate: `${richting ?? 0}deg` }] }} />
    </View>
  );
}

function NativeKaart({ maps, positie }: { maps: MapsModule; positie: LiveRitPositie }) {
  const Map = maps.default;
  const MarkerAnimated = maps.Marker.Animated;
  const UrlTile = maps.UrlTile;
  const mapRef = useRef<MapView>(null);
  const [coordinate] = useState(() => new maps.AnimatedRegion({
    latitude: positie.lat, longitude: positie.lon,
    latitudeDelta: 0.009, longitudeDelta: 0.009
  }));
  useEffect(() => {
    // Vier seconden geanimeerde overgang bij vijf seconden poll-interval.
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
    <Map ref={mapRef} style={StyleSheet.absoluteFill}
      mapType="none" initialRegion={{
        latitude: positie.lat, longitude: positie.lon,
        latitudeDelta: 0.009, longitudeDelta: 0.009
      }}
      scrollEnabled={false} pitchEnabled={false} zoomEnabled={false}
      rotateEnabled={false} toolbarEnabled={false}
    >
      <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maximumZ={19} tileSize={256} flipY={false} />
      <MarkerAnimated coordinate={coordinate as unknown as { latitude: number; longitude: number }} flat={true}
        anchor={{ x: 0.5, y: 0.5 }} rotation={positie.richting ?? 0}
        tracksViewChanges={false}>
        <View style={s.voertuigMarker}>
          <Ionicons name="navigate" color="#fff" size={20} />
        </View>
      </MarkerAnimated>
    </Map>
  );
}

/** Bestaande preview-APK mist de native MapView; een lichte 3×3 OSM-kaart
 * met RN Animated houdt de OTA bruikbaar zonder de app te laten crashen.
 */
function TegelKaart({ positie }: { positie: LiveRitPositie }) {
  const zoom = 14;
  const [center, setCenter] = useState(positie);
  const [width, setWidth] = useState(375);
  const origin = useMemo(() => wereldPixels(center.lat, center.lon, zoom), [center.lat, center.lon]);
  const moving = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const tiles = useMemo(() => {
    const tileX = Math.floor(origin.x / 256);
    const tileY = Math.floor(origin.y / 256);
    const out: { x: number; y: number; source: string; left: number; top: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = tileX + dx, y = tileY + dy;
        const max = 2 ** zoom;
        if (y < 0 || y >= max) continue;
        out.push({
          x, y, source: `https://tile.openstreetmap.org/${zoom}/${(x + max) % max}/${y}.png`,
          left: x * 256 - origin.x, top: y * 256 - origin.y
        });
      }
    }
    return out;
  }, [origin.x, origin.y]);
  useEffect(() => {
    const world = wereldPixels(positie.lat, positie.lon, zoom);
    const offsetX = world.x - origin.x, offsetY = world.y - origin.y;
    if (Math.abs(offsetX) > 120 || Math.abs(offsetY) > 120) {
      // Hercenter de tegelkaart voordat de marker van het scherm verdwijnt.
      moving.stopAnimation();
      moving.setValue({ x: 0, y: 0 });
      setCenter(positie);
      return;
    }
    Animated.timing(moving, {
      toValue: { x: offsetX, y: offsetY },
      duration: LIVE_MAP_ANIMATION_MS, useNativeDriver: true
    }).start();
  }, [moving, origin.x, origin.y, positie.lat, positie.lon, positie.timestamp]);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {tiles.map(tile => (
        <Image key={`${tile.x}:${tile.y}`}
          source={{ uri: tile.source, headers: { "User-Agent": "OVspot-beta/1.0" } }}
          style={{ position: "absolute", width: 256, height: 256,
            left: width / 2 + tile.left, top: 125 + tile.top }}
        />
      ))}
      <Animated.View style={[s.tegelMarker, {
        left: width / 2 - 20, top: 125 - 20,
        transform: [{ translateX: moving.x }, { translateY: moving.y }]
      }]}>
        <VoertuigIcoon richting={positie.richting} />
      </Animated.View>
    </View>
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
        // Geen onjuiste/stale positie blijven tonen bij een verdwenen rit.
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

  // Zonder unieke verse rit/voertuig-koppeling géén willekeurige bus op de kaart.
  if (!actief || !positie) return null;
  return (
    <View style={[s.kaart, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {maps ? <NativeKaart key={ritId} maps={maps} positie={positie} /> :
        <TegelKaart key={ritId} positie={positie} />}
      <View style={[s.kop, { backgroundColor: colors.surface }]}>
        <Ionicons name="navigate-circle" size={16} color={colors.live} />
        <Text style={[s.kopText, { color: colors.text }]} numberOfLines={1}>
          Live voertuig · lijn {positie.lijnnummer}
        </Text>
      </View>
      <View style={[s.vermelding, { backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.sub, fontSize: 10 }}>© OpenStreetMap · NDOV</Text>
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
  vermelding: { position: "absolute", bottom: 6, right: 6,
    borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  voertuigMarker: { backgroundColor: "#185c98", borderWidth: 2, borderColor: "#fff",
    width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  tegelMarker: { position: "absolute", width: 40, height: 40 },
});
