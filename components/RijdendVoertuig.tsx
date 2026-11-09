import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

/** De echte GPS bepaalt voortgang. Alleen bij binnenkomst van een NIEUWE fix
 * schuift het pictogram kort naar de nieuwe positie: geen klok-extrapolatie.
 * De lengte van het traject is de afstand tussen haltestippen in de UI.
 */
export function RijdendVoertuig({ voortgang, vorigeHoogte, huidigeHoogte,
  geredenKleur, teRijdenKleur, trein }: {
  voortgang: number; vorigeHoogte: number; huidigeHoogte: number;
  geredenKleur: string; teRijdenKleur: string; trein: boolean;
}) {
  const fractie = Math.max(0.20, Math.min(0.80, voortgang));
  const beweging = useRef(new Animated.Value(fractie)).current;
  const lengte = (vorigeHoogte + huidigeHoogte) / 2;
  useEffect(() => {
    const move = Animated.timing(beweging, {
      toValue: fractie, duration: 650, useNativeDriver: false, isInteraction: false
    });
    move.start();
    return () => move.stop();
  }, [beweging, fractie]);
  return (
    <View pointerEvents="none" accessible={false}
      style={[s.traject, { height: lengte, top: -vorigeHoogte / 2 }]}>
      <View style={[s.lijn, { height: lengte, backgroundColor: teRijdenKleur }]} />
      <Animated.View style={[s.lijn, {
        backgroundColor: geredenKleur,
        height: beweging.interpolate({ inputRange: [0, 1], outputRange: [0, lengte] })
      }]} />
      <Animated.View style={[s.voertuig, {
        backgroundColor: teRijdenKleur,
        top: beweging.interpolate({ inputRange: [0, 1], outputRange: [-14, lengte - 14] })
      }]}>
        <Ionicons name={trein ? "train" : "bus"} size={15} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}
const s = StyleSheet.create({
  traject: { position: "absolute", left: 0, width: 28, overflow: "visible", zIndex: 4 },
  lijn: { position: "absolute", left: 12, top: 0, width: 3 },
  voertuig: { position: "absolute", left: 0, width: 28, height: 28,
    borderRadius: 14, borderWidth: 2, borderColor: "#FFFFFF",
    justifyContent: "center", alignItems: "center", zIndex: 5, elevation: 3 }
});
