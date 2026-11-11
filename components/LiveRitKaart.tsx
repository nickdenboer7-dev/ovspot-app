import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./LocalizedText";
import MapView, { AnimatedRegion, Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { darkMapStyle } from "../constants/darkMapStyle";
import { geldigeKaartPunten, LIVE_MAP_ANIMATION_MS, moetVoertuigSnappen, ritRouteKleur, ritRouteKleurDonker } from "../lib/liveRitKaart";
import type { VorigeLiveKaartFix } from "../lib/liveRitKaart";
import type { LiveRitPositie, RitKaartHalte, RitKaartPunt } from "../lib/types";
import { useApp } from "../context/AppProvider";

const STARTREGIO = {
  latitude: 52.15,
  longitude: 5.4,
  latitudeDelta: 1.1,
  longitudeDelta: 1.1
};
const VOLGREGIO_DELTA = 0.009;

function voertuigRegio(positie: LiveRitPositie) {
  return {
    latitude: positie.lat,
    longitude: positie.lon,
    latitudeDelta: VOLGREGIO_DELTA,
    longitudeDelta: VOLGREGIO_DELTA
  };
}

type Props = {
  ritId: string;
  datum: string;
  positie: LiveRitPositie | null;
  lijnnummer: string;
  volgendeHalte: string;
  vertragingMin: number;
  shape?: RitKaartPunt[];
  stops?: RitKaartHalte[];
  routeColor?: string;
  onderRuimte?: number;
  onLijst: () => void;
};

/** One GPS fix shared with the stop list; never start a second competing poll. */
export function LiveRitKaart({
  ritId, datum, positie, lijnnummer, volgendeHalte, vertragingMin,
  shape, stops, routeColor, onderRuimte = 18, onLijst
}: Props) {
  const { colors, scheme, t } = useApp();
  const isDark = scheme === "dark";
  const routePunten = useMemo(() => geldigeKaartPunten(shape), [shape]);
  const lijnKleur = isDark ? ritRouteKleurDonker(routeColor) : ritRouteKleur(routeColor);
  const voertuigKleur = colors.vehicle;
  // Android moet eerst de custom marker inclusief tekst/snavel kunnen rasteren.
  const [markerTracksViewChanges, setMarkerTracksViewChanges] = useState(true);
  const heeftGeldigeVoertuigPositie = Number.isFinite(positie?.lat) && Number.isFinite(positie?.lon);
  const heading = typeof positie?.richting === "number" && Number.isFinite(positie.richting)
    ? positie.richting : 0;
  const [coordinate] = useState(() => new AnimatedRegion(STARTREGIO));
  const mapRef = useRef<MapView>(null);
  const kaartKlaar = useRef(false);
  const volgVoertuig = useRef(true);
  const vorigeFix = useRef<VorigeLiveKaartFix | null>(null);
  const skipAnimation = useRef(true);
  const appStatus = useRef(AppState.currentState);

  useEffect(() => {
    const appStateListener = AppState.addEventListener("change", volgendeState => {
      const vorig = appStatus.current;
      appStatus.current = volgendeState;
      if (volgendeState !== "active") {
        skipAnimation.current = true;
        coordinate.stopAnimation(() => {});
      } else if (vorig !== "active") {
        // The parent refreshes GPS on foreground; the map snaps to its new fix.
        skipAnimation.current = true;
      }
    });
    return () => appStateListener.remove();
  }, [coordinate]);

  useEffect(() => {
    if (!positie || !Number.isFinite(positie.lat) || !Number.isFinite(positie.lon)) {
      vorigeFix.current = null;
      skipAnimation.current = true;
      coordinate.stopAnimation(() => {});
      return;
    }
    if (appStatus.current !== "active") {
      // Een achtergrond-GPS-update mag geen onzichtbare animatie starten.
      skipAnimation.current = true;
      return;
    }

    try {
      const ontvangenMs = Date.now();
      const snap = moetVoertuigSnappen(vorigeFix.current, positie, ontvangenMs, skipAnimation.current);
      const regio = voertuigRegio(positie);
      // Stop een nog lopende 4s-interpolatie voordat een nieuwe fix binnenkomt.
      coordinate.stopAnimation(() => {});
      if (snap) {
        // Geen zichtbare sprong bij >180m, >15s of na terugkeer uit achtergrond.
        coordinate.setValue(regio);
      } else {
        coordinate.timing({
          ...regio,
          duration: LIVE_MAP_ANIMATION_MS,
          useNativeDriver: false
        } as unknown as Parameters<typeof coordinate.timing>[0]).start();
      }
      vorigeFix.current = {
        lat: positie.lat, lon: positie.lon, timestamp: positie.timestamp, ontvangenMs
      };
      skipAnimation.current = false;

      if (kaartKlaar.current && volgVoertuig.current) {
        mapRef.current?.animateToRegion(regio, snap ? 0 : LIVE_MAP_ANIMATION_MS);
      }
    } catch (error) {
      console.error("[LiveRitKaart] Native Google Maps-animatie mislukt", error);
      throw error;
    }
  }, [coordinate, positie?.lat, positie?.lon, positie?.timestamp]);

  useEffect(() => {
    if (!heeftGeldigeVoertuigPositie) {
      setMarkerTracksViewChanges(true);
      return;
    }
    setMarkerTracksViewChanges(true);
    // Pas NA de eerste Android-snapshot uitschakelen, niet tijdens render.
    const snapshotTimer = setTimeout(() => setMarkerTracksViewChanges(false), 750);
    return () => clearTimeout(snapshotTimer);
  }, [heeftGeldigeVoertuigPositie, lijnnummer, positie?.lijnnummer, colors.accent, colors.surface]);

  useEffect(() => () => {
    // Laat geen JS-animatie doorlopen nadat de kaart wordt gesloten.
    coordinate.stopAnimation(() => {});
  }, [coordinate]);

  function centreerVoertuig() {
    if (!positie) return;
    try {
      volgVoertuig.current = true;
      mapRef.current?.animateToRegion(voertuigRegio(positie), 550);
    } catch (error) {
      console.error("[LiveRitKaart] Hercentreren mislukt", error);
      throw error;
    }
  }

  return (
    <View style={[s.scherm, { backgroundColor: colors.background }]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        mapType="standard"
        customMapStyle={isDark ? darkMapStyle : []}
        initialRegion={STARTREGIO}
        scrollEnabled={true}
        zoomEnabled={true}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        onMapReady={() => {
          kaartKlaar.current = true;
          try {
            if (positie && volgVoertuig.current) {
              mapRef.current?.animateToRegion(voertuigRegio(positie), 450);
            } else if (routePunten.length >= 2) {
              // Geen GPS-fix: toon het gehele dienstregelingstracé.
              mapRef.current?.fitToCoordinates(routePunten, {
                edgePadding: { top: 70, right: 45, bottom: 270, left: 45 },
                animated: true
              });
            }
          } catch (error) {
            console.error("[LiveRitKaart] Routekaart niet gecentreerd", error);
          }
        }}
        onPanDrag={() => { volgVoertuig.current = false; }}
      >
        {routePunten.length >= 2 ? (
          <Polyline
            coordinates={routePunten}
            strokeColor={lijnKleur}
            strokeWidth={4}
            lineJoin="round"
            lineCap="round"
            zIndex={1}
          />
        ) : null}
        {(stops || []).map(stop => (
          <Marker
            key={`${stop.stop_id}:${stop.stop_sequence}:${stop.gepasseerd ? "voorbij" : "komend"}:${scheme}`}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={2}
          >
            <View style={[
              s.halteDot,
              stop.gepasseerd ? s.halteGepasseerd : s.halteKomend,
              isDark ? (stop.gepasseerd ? s.halteGepasseerdDonker : s.halteKomendDonker) : null
            ]} />
          </Marker>
        ))}
        {positie && heeftGeldigeVoertuigPositie ? (
          <Marker.Animated
            coordinate={coordinate as unknown as { latitude: number; longitude: number }}
            flat={true}
            rotation={heading}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={markerTracksViewChanges}
          >
            <View style={s.voertuigMarkerContainer}>
              <View style={s.snavelRand} />
              <View style={[s.richtingSnavel, { borderBottomColor: voertuigKleur }]} />
              <View style={[s.voertuigMarker, {
                backgroundColor: voertuigKleur,
                borderColor: "#FFFFFF"
              }]}>
                <Text style={[s.markerLijn, { color: "#FFFFFF" }]}
                  numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {lijnnummer || positie.lijnnummer}
                </Text>
              </View>
            </View>
          </Marker.Animated>
        ) : null}
      </MapView>

      <Pressable
        onPress={centreerVoertuig}
        disabled={!positie}
        accessibilityRole="button"
        accessibilityLabel={t("Centreer kaart op live voertuig")}
        accessibilityState={{ disabled: !positie }}
        style={[s.centreerKnop, {
          backgroundColor: colors.mapButton,
          borderColor: colors.mapButtonBorder,
          opacity: positie ? 1 : 0.55
        }]}
      >
        <Ionicons name="locate" size={23} color={isDark ? "#FFFFFF" : colors.accent} />
      </Pressable>

      <View style={[s.statusKaart, {
        bottom: Math.max(onderRuimte, 16),
        backgroundColor: colors.surface,
        borderColor: colors.border
      }]}>
        <View style={s.statusKop}>
          <View style={[s.statusPill, { backgroundColor: positie ? colors.liveGlow : colors.surface2 }]}>
            <View style={[s.liveDot, { backgroundColor: positie ? colors.live : colors.muted }]} />
            <Text style={[s.statusPillTekst, { color: positie ? colors.live : colors.sub }]}>
              {positie ? "LIVE VOERTUIG" : "GEEN ACTUELE GPS"}
            </Text>
          </View>
          {Number.isFinite(vertragingMin) ? (
            <View style={[s.punctualiteitBadge, {
              backgroundColor: vertragingMin > 0 ? colors.warnBg : colors.liveGlow
            }]}>
              <Text style={[s.punctualiteitTekst, {
                color: vertragingMin > 0 ? colors.delay : colors.live
              }]}>
                {vertragingMin > 0 ? `+${vertragingMin} min` : vertragingMin === 0 ? "Op tijd" : t(`${Math.abs(vertragingMin)} min te vroeg`)}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={[s.statusTitel, { color: colors.text }]} numberOfLines={2}>
          {positie
            ? `Onderweg naar ${volgendeHalte || "de volgende halte"}`
            : "Nog geen bevestigde voertuiglocatie"}
        </Text>
        <Text style={[s.statusSub, { color: colors.sub }]} numberOfLines={2}>
          {positie
            ? `Lijn ${lijnnummer || positie.lijnnummer} · ${positie.leeftijd_s} sec geleden`
            : "We controleren elke 5 seconden of deze rit een live voertuig heeft."}
        </Text>

        <Pressable
          onPress={onLijst}
          accessibilityRole="button"
          accessibilityLabel={t("Terug naar de haltelijst")}
          style={[s.terugKnop, { backgroundColor: colors.accent }]}
        >
          <Ionicons name="list-outline" size={19} color={colors.onAccent} />
          <Text style={[s.terugTekst, { color: colors.onAccent }]}>Bekijk haltelijst</Text>
          <Ionicons name="arrow-forward" size={17} color={colors.onAccent} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  scherm: { flex: 1, overflow: "hidden" },
  centreerKnop: {
    position: "absolute", top: 16, right: 16, width: 50, height: 50,
    borderRadius: 25, borderWidth: 1, alignItems: "center", justifyContent: "center",
    elevation: 4, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 7
  },
  // Buitenste marker is rondom het hart van de cirkel gecentreerd.
  // Native Marker rotation draait het snaveltje (noord/bearing=0 bovenaan) mee.
  voertuigMarkerContainer: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  // Witte onderliggende driehoek creëert een scherpe outline op donkere routes.
  snavelRand: {
    position: "absolute", left: 18, top: -2, width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 13,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "#FFFFFF"
  },
  richtingSnavel: {
    position: "absolute", left: 20, top: 0, width: 0, height: 0,
    borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 9,
    borderLeftColor: "transparent", borderRightColor: "transparent"
  },
  voertuigMarker: {
    position: "absolute", top: 6, left: 6,
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, alignItems: "center", justifyContent: "center",
    elevation: 4
  },
  markerLijn: { fontSize: 13, fontWeight: "bold", textAlign: "center", maxWidth: 30, includeFontPadding: false },
  halteDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  halteKomend: { backgroundColor: "#FFFFFF", borderColor: "#1E3A8A" },
  halteGepasseerd: { backgroundColor: "#9CA3AF", borderColor: "#6B7280" },
  halteKomendDonker: { backgroundColor: "#FFFFFF", borderColor: "#38BDF8" },
  halteGepasseerdDonker: { backgroundColor: "#94A3B8", borderColor: "#E2E8F0" },
  statusKaart: {
    position: "absolute", left: 16, right: 16,
    borderRadius: 22, borderWidth: 1, padding: 17,
    elevation: 6, shadowColor: "#000", shadowOpacity: 0.16,
    shadowRadius: 16, shadowOffset: { width: 0, height: 4 }
  },
  statusKop: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    gap: 8, marginBottom: 10
  },
  statusPill: {
    flexDirection: "row", gap: 7, alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  statusPillTekst: { fontSize: 10, fontWeight: "800", letterSpacing: 0.55 },
  punctualiteitBadge: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 18 },
  punctualiteitTekst: { fontSize: 13, fontWeight: "800" },
  statusTitel: { fontSize: 19, fontWeight: "800", lineHeight: 25, letterSpacing: -0.3 },
  statusSub: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  terugKnop: {
    marginTop: 16, minHeight: 47, borderRadius: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9
  },
  terugTekst: { fontSize: 14, fontWeight: "800" }
});
