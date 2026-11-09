import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

/**
 * Tekent op de rail van de VOLGENDE halterij het hele traject vanaf de
 * vorige haltestip. Absolute positionering voegt geen rij of witruimte toe.
 * De fractie is tijd-geïnterpoleerd, geen exacte GPS-coördinaat.
 */
export function RijdendVoertuig({
  voortgang, volgendeMs, vorigeHoogte, huidigeHoogte, trein, geredenKleur,
  teRijdenKleur
}: {
  voortgang: number;
  volgendeMs: number;
  vorigeHoogte: number;
  huidigeHoogte: number;
  trein: boolean;
  geredenKleur: string;
  teRijdenKleur: string;
}) {
  const beweging = useRef(new Animated.Value(voortgang)).current;
  const hoogte = (vorigeHoogte + huidigeHoogte) / 2;

  useEffect(() => {
    beweging.stopAnimation();
    beweging.setValue(voortgang);
    const resterendMs = volgendeMs - Date.now();
    if (resterendMs <= 0 || voortgang >= 0.95) return;
    const animatie = Animated.timing(beweging, {
      toValue: 0.95,
      duration: Math.min(Math.max(1200, resterendMs), 60 * 60_000),
      useNativeDriver: false,
      isInteraction: false
    });
    animatie.start();
    return () => animatie.stop();
  }, [beweging, volgendeMs]); // bij elke ETA-wijziging opnieuw uitlijnen; niet bij UI-rerenders

  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={[s.traject, {
        top: -vorigeHoogte / 2,
        height: hoogte
      }]}
    >
      <View style={[s.lijn, { height: hoogte, backgroundColor: teRijdenKleur }]} />
      <Animated.View style={[s.lijn, {
        backgroundColor: geredenKleur,
        height: beweging.interpolate({ inputRange: [0, 1], outputRange: [0, hoogte] })
      }]} />
      <Animated.View style={[s.voertuig, {
        backgroundColor: teRijdenKleur,
        top: beweging.interpolate({ inputRange: [0, 1], outputRange: [-13, hoogte - 13] })
      }]}>
        <Ionicons name={trein ? "train" : "bus"} size={15} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  traject: { position: "absolute", left: 0, width: 32, overflow: "visible", zIndex: 4 },
  lijn: { position: "absolute", left: 14, top: 0, width: 4 },
  voertuig: {
    position: "absolute", left: 3, width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: "#FFFFFF", justifyContent: "center",
    alignItems: "center", elevation: 3, zIndex: 5
  }
});
