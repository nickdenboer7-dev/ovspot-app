import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { AnimatedRegion, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { api } from "../lib/api";
import { geldigeRitPositie, LIVE_MAP_ANIMATION_MS, LIVE_MAP_POLL_MS } from "../lib/liveRitKaart";
import type { LiveRitPositie } from "../lib/types";
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
  lijnnummer: string;
  volgendeHalte: string;
  vertragingMin: number;
  onderRuimte?: number;
  onLijst: () => void;
};

/** Full-screen Google Maps onder de ritheader. Polling leeft uitsluitend
 * zolang het kaarttabblad is gemount; er worden nooit andere ritten gegokt.
 */
export function LiveRitKaart({
  ritId, datum, lijnnummer, volgendeHalte, vertragingMin,
  onderRuimte = 18, onLijst
}: Props) {
  const { colors } = useApp();
  const [positie, setPositie] = useState<LiveRitPositie | null>(null);
  const [coordinate] = useState(() => new AnimatedRegion(STARTREGIO));
  const mapRef = useRef<MapView>(null);
  const kaartKlaar = useRef(false);
  const volgVoertuig = useRef(true);
  const eerdereFix = useRef(false);

  useEffect(() => {
    let gesloten = false;
    let bezig = false;
    setPositie(null);

    async function ophalen() {
      if (bezig) return;
      bezig = true;
      try {
        const antwoord = await api.liveRitVoertuig(ritId, datum);
        if (!gesloten) setPositie(geldigeRitPositie(antwoord, ritId, datum));
      } catch (error) {
        console.error("[LiveRitKaart] NDOV-voertuigpositie niet opgehaald", error);
        if (!gesloten) setPositie(huidige =>
          huidige && Date.now() / 1000 - huidige.timestamp <= 180 ? huidige : null);
      } finally {
        bezig = false;
      }
    }

    void ophalen();
    const interval = setInterval(() => void ophalen(), LIVE_MAP_POLL_MS);
    return () => {
      gesloten = true;
      clearInterval(interval);
    };
  }, [ritId, datum]);

  useEffect(() => {
    if (!positie) {
      eerdereFix.current = false;
      return;
    }

    try {
      // Eerste GPS-fix meteen plaatsen; volgende punten in vier seconden interpoleren.
      const duur = eerdereFix.current ? LIVE_MAP_ANIMATION_MS : 0;
      coordinate.timing({
        ...voertuigRegio(positie),
        duration: duur,
        useNativeDriver: false
      } as unknown as Parameters<typeof coordinate.timing>[0]).start();
      eerdereFix.current = true;

      if (kaartKlaar.current && volgVoertuig.current) {
        mapRef.current?.animateToRegion(voertuigRegio(positie), duur || 450);
      }
    } catch (error) {
      console.error("[LiveRitKaart] Native Google Maps-animatie mislukt", error);
      throw error;
    }
  }, [coordinate, positie?.lat, positie?.lon, positie?.timestamp]);

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
        initialRegion={STARTREGIO}
        scrollEnabled={true}
        zoomEnabled={true}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        onMapReady={() => {
          kaartKlaar.current = true;
          if (positie && volgVoertuig.current) {
            mapRef.current?.animateToRegion(voertuigRegio(positie), 450);
          }
        }}
        onPanDrag={() => { volgVoertuig.current = false; }}
      >
        {positie ? (
          <Marker.Animated
            coordinate={coordinate as unknown as { latitude: number; longitude: number }}
            flat={true}
            rotation={positie.richting ?? 0}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={[s.voertuigMarker, {
              backgroundColor: colors.accent,
              borderColor: colors.surface
            }]}>
              <Ionicons name="navigate" color={colors.onAccent} size={18} />
              <Text style={[s.markerLijn, { color: colors.onAccent }]}
                numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                {lijnnummer || positie.lijnnummer}
              </Text>
            </View>
          </Marker.Animated>
        ) : null}
      </MapView>

      <Pressable
        onPress={centreerVoertuig}
        disabled={!positie}
        accessibilityRole="button"
        accessibilityLabel="Centreer kaart op live voertuig"
        accessibilityState={{ disabled: !positie }}
        style={[s.centreerKnop, {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: positie ? 1 : 0.55
        }]}
      >
        <Ionicons name="locate" size={23} color={colors.accent} />
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
          {positie && vertragingMin > 0 ? (
            <Text style={[s.vertraging, { color: colors.delay }]}>
              +{vertragingMin} min
            </Text>
          ) : null}
        </View>

        <Text style={[s.statusTitel, { color: colors.text }]} numberOfLines={2}>
          {positie
            ? `Onderweg naar ${volgendeHalte || "de volgende halte"}`
            : "Nog geen bevestigde voertuiglocatie"}
        </Text>
        <Text style={[s.statusSub, { color: colors.sub }]} numberOfLines={2}>
          {positie
            ? `Lijn ${lijnnummer || positie.lijnnummer} · NDOV · ${positie.leeftijd_s} sec geleden`
            : "We controleren elke 5 seconden of deze rit een live voertuig heeft."}
        </Text>

        <Pressable
          onPress={onLijst}
          accessibilityRole="button"
          accessibilityLabel="Terug naar de haltelijst"
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
  voertuigMarker: {
    minWidth: 59, height: 59, borderRadius: 30, paddingHorizontal: 5,
    borderWidth: 3, alignItems: "center", justifyContent: "center",
    elevation: 4
  },
  markerLijn: { fontSize: 13, fontWeight: "900", textAlign: "center", maxWidth: 51 },
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
  vertraging: { fontSize: 14, fontWeight: "800" },
  statusTitel: { fontSize: 19, fontWeight: "800", lineHeight: 25, letterSpacing: -0.3 },
  statusSub: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  terugKnop: {
    marginTop: 16, minHeight: 47, borderRadius: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9
  },
  terugTekst: { fontSize: 14, fontWeight: "800" }
});
