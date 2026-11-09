import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { veiligeVoertuigPositie, VOERTUIG_DIAMETER } from "../lib/ritverloopV2";

/**
 * GPS-positie op het verbindingsstuk tussen twee haltes. Het busje
 * schuift alleen naar een nieuwe GPS-fix; geen tijd- of snelheidsschatting.
 * De uit te tekenen ANIMATIE blijft binnen de vrije ruimte tussen beide
 * haltecircles, ook als een vorige render een andere positie had.
 */
export function RijdendVoertuig({ voortgang, vorigeHoogte, huidigeHoogte,
  geredenKleur, teRijdenKleur, trein }: {
  voortgang: number; vorigeHoogte: number; huidigeHoogte: number;
  geredenKleur: string; teRijdenKleur: string; trein: boolean;
}) {
  const veilig = veiligeVoertuigPositie(voortgang, vorigeHoogte, huidigeHoogte);
  const doel = veilig?.normaal ?? 0.5;
  const beweging = useRef(new Animated.Value(doel)).current;

  useEffect(() => {
    const animatie = Animated.timing(beweging, {
      toValue: doel,
      duration: 480,
      useNativeDriver: false,
      isInteraction: false
    });
    animatie.start();
    return () => animatie.stop();
  }, [beweging, doel]);

  // Bij een te kort traject is een busje zonder overlapping geometrisch
  // onmogelijk. Toon dan uitsluitend de doorgaande halteverbinding.
  if (!veilig) return null;
  const { lengte, minCentrum, maxCentrum } = veilig;
  const centrum = beweging.interpolate({
    inputRange: [0, 1],
    outputRange: [minCentrum, maxCentrum],
    extrapolate: "clamp"
  });
  const bovenkant = beweging.interpolate({
    inputRange: [0, 1],
    outputRange: [minCentrum - VOERTUIG_DIAMETER / 2,
      maxCentrum - VOERTUIG_DIAMETER / 2],
    extrapolate: "clamp"
  });

  return (
    <View pointerEvents="none" accessible={false}
      style={[s.traject, { height: lengte, top: -vorigeHoogte / 2 }]}>
      {/* Rustig één lijnstuk: grijs boven de bus, blauw eronder. */}
      <View style={[s.lijn, { height: lengte, backgroundColor: teRijdenKleur }]} />
      <Animated.View style={[s.lijn, {
        backgroundColor: geredenKleur,
        height: centrum
      }]} />
      <Animated.View style={[s.voertuig, {
        backgroundColor: teRijdenKleur,
        top: bovenkant
      }]}>
        <Ionicons name={trein ? "train" : "bus"} size={15} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  traject: { position: "absolute", left: 0, width: 28, overflow: "visible", zIndex: 4 },
  lijn: { position: "absolute", left: 13, top: 0, width: 2 },
  voertuig: {
    position: "absolute", left: 0, width: VOERTUIG_DIAMETER, height: VOERTUIG_DIAMETER,
    borderRadius: VOERTUIG_DIAMETER / 2,
    borderWidth: 2, borderColor: "#FFFFFF",
    justifyContent: "center", alignItems: "center", zIndex: 5
  }
});
