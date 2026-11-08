import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Chips, Kop } from "../components/ui";
import { useApp } from "../context/AppProvider";
import { afstand } from "../lib/format";
import type { Filter } from "../lib/types";

/** Bestaande GPS-fallback-, afstands- en haltebordvoorkeuren blijven bereikbaar. */
export default function Geavanceerd() {
  const { colors, instellingen, zetInstellingen } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Kop terug titel="Locatie & haltebord" />
      <ScrollView contentContainerStyle={s.inhoud}>
        <View style={[s.kaart, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.titel, { color: colors.text }]}>Standaard haltefilter</Text>
          <Text style={[s.uitleg, { color: colors.sub }]}>Zo opent het vertrekbord.</Text>
          <Chips<Filter> vol waarde={instellingen.filter}
            opties={[{key:"alles",label:"Alles"}, {key:"trein",label:"Trein"}, {key:"bus",label:"Bus"}]}
            onKies={filter => zetInstellingen({ filter })}/>
        </View>
        <View style={[s.kaart, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.titel, { color: colors.text }]}>Afstand voor Dichtbij</Text>
          <Text style={[s.uitleg, { color: colors.sub }]}>Haltes tot {afstand(instellingen.straal)} van je locatie.</Text>
          <View style={s.afstand}>
            {[500,1000,1500,3000].map(m => {
              const actief = m === instellingen.straal;
              return (
                <Pressable key={m} onPress={() => zetInstellingen({ straal:m })}
                  accessibilityRole="radio" accessibilityState={{ checked: actief }}
                  style={[s.optie, { borderColor: actief ? colors.accent : colors.border,
                    backgroundColor: actief ? colors.infoBg : colors.surface2 }]}>
                  <Text style={{ color: actief ? colors.infoText : colors.text, fontWeight: "700" }}>{afstand(m)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={[s.kaart, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.titel, { color: colors.text }]}>Thuislocatie</Text>
          <Text style={[s.uitleg, { color: colors.sub }]}>
            {instellingen.thuis ? `${instellingen.thuis.naam}, ${instellingen.thuis.plaats}`
              : "Niet ingesteld. Wordt gebruikt wanneer locatie uitstaat."}
          </Text>
          <Pressable onPress={() => router.push({pathname:"/zoek",params:{doel:"thuis"}})}
            style={s.actie} accessibilityRole="button">
            <Ionicons name="home-outline" size={20} color={colors.accent} />
            <Text style={{color:colors.text, fontWeight:"700"}}>
              {instellingen.thuis ? "Andere halte kiezen" : "Thuislocatie instellen"}
            </Text>
          </Pressable>
          {instellingen.thuis ? (
            <Pressable onPress={() => zetInstellingen({ thuis:null })} style={s.actie} accessibilityRole="button">
              <Ionicons name="close-circle-outline" size={20} color={colors.red} />
              <Text style={{color:colors.red,fontWeight:"700"}}>Thuislocatie wissen</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const s=StyleSheet.create({
  inhoud:{padding:16,gap:16,paddingBottom:34},
  kaart:{borderRadius:18,borderWidth:1,padding:16,gap:12},
  titel:{fontSize:16,fontWeight:"800"},
  uitleg:{fontSize:13,lineHeight:19},
  afstand:{flexDirection:"row",flexWrap:"wrap",gap:8},
  optie:{paddingHorizontal:12,paddingVertical:10,borderRadius:12,borderWidth:1},
  actie:{flexDirection:"row",alignItems:"center",gap:10,minHeight:46}
});
