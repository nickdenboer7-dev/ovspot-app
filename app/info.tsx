import Constants from "expo-constants";
import { Kop } from "../components/ui";
import { useApp } from "../context/AppProvider";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../components/LocalizedText";

export default function Info() {
  const { colors } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Kop terug titel="Over OVspot" />
      <ScrollView contentContainerStyle={s.inhoud}>
        <View style={[s.kaart,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Text style={[s.titel,{color:colors.text}]}>OVspot</Text>
          <Text style={[s.tekst,{color:colors.body}]}>
            Versie {Constants.nativeAppVersion || Constants.expoConfig?.version || "1.0.0"}.
            Vertrektijden, storingen en voertuigposities zijn afhankelijk van externe OV-bronnen.
          </Text>
        </View>
        <View style={[s.kaart,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Text style={[s.titel,{color:colors.text}]}>Licenties</Text>
          <Text style={[s.tekst,{color:colors.body}]}>
            OVspot gebruikt onder meer Expo, React Native, React Navigation, React Native Maps
            en open vervoersdata zoals GTFS en NDOV. De softwarecomponenten vallen onder hun
            eigen licentievoorwaarden.
          </Text>
        </View>
        <View style={[s.kaart,{backgroundColor:colors.surface,borderColor:colors.border}]}>
          <Text style={[s.titel,{color:colors.text}]}>Algemene voorwaarden & informatie</Text>
          <Text style={[s.tekst,{color:colors.body}]}>
            Reisinformatie kan wijzigen, vertraagd worden bijgewerkt of onvolledig zijn.
            Controleer belangrijke reizen bij de vervoerder. Voor feedback is een
            e-mailadres optioneel. Je kunt de GPS-toestemming via Android beheren.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
const s=StyleSheet.create({
  inhoud:{padding:16,gap:16,paddingBottom:36},
  kaart:{padding:17,borderWidth:1,borderRadius:18,gap:10},
  titel:{fontSize:17,fontWeight:"800"},
  tekst:{fontSize:14,lineHeight:22}
});
