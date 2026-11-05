import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import * as Updates from "expo-updates";
import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Chips, Kaart, Kop } from "../../components/ui";
import { useApp } from "../../context/AppProvider";
import { afstand } from "../../lib/format";
import type { Filter, Thema } from "../../lib/types";

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  const { colors } = useApp();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.sectieTitel, { color: colors.sub }]} accessibilityRole="header">
        {titel}
      </Text>
      <Kaart style={s.sectieKaart}>{children}</Kaart>
    </View>
  );
}

function Regel({ label, uitleg, children }: { label: string; uitleg?: string; children?: React.ReactNode }) {
  const { colors } = useApp();
  return (
    <View style={s.regel}>
      <Text style={[s.label, { color: colors.text }]}>{label}</Text>
      {uitleg ? <Text style={[s.uitleg, { color: colors.sub }]}>{uitleg}</Text> : null}
      {children ? <View style={{ marginTop: 10 }}>{children}</View> : null}
    </View>
  );
}

function Link({ icoon, label, onPress, gevaar }: { icoon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; gevaar?: boolean }) {
  const { colors } = useApp();
  return (
    <Pressable onPress={onPress} style={s.link} accessibilityRole="button" android_ripple={{ color: colors.divider }}>
      <Ionicons name={icoon} size={22} color={gevaar ? colors.red : colors.accent} />
      <Text style={[s.linkText, { color: gevaar ? colors.red : colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.sub} />
    </Pressable>
  );
}

export default function Instellingen() {
  const { colors, instellingen, zetInstellingen } = useApp();
  const versie = Constants.expoConfig?.version ?? "1.0.0";
  const update = Updates.updateId ? ` · update ${Updates.updateId.slice(0, 8)}` : "";
  const scheiding = { borderTopColor: colors.divider, borderTopWidth: StyleSheet.hairlineWidth * 2 };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Kop groot titel="Instellingen" />
      <ScrollView contentContainerStyle={s.lijst}>
        <Sectie titel="WEERGAVE">
          <Regel label="Thema" uitleg="Systeem volgt de instelling van je telefoon.">
            <Chips<Thema>
              opties={[
                { key: "systeem", label: "Systeem", icoon: "phone-portrait-outline" },
                { key: "licht", label: "Licht", icoon: "sunny-outline" },
                { key: "donker", label: "Donker", icoon: "moon-outline" }
              ]}
              waarde={instellingen.thema}
              onKies={(thema) => zetInstellingen({ thema })}
            />
          </Regel>
        </Sectie>

        <Sectie titel="HALTEBORD">
          <Regel label="Standaard filter" uitleg="Hiermee opent een haltebord.">
            <Chips<Filter>
              opties={[
                { key: "alles", label: "Alles" },
                { key: "trein", label: "Trein", icoon: "train-outline" },
                { key: "bus", label: "Bus", icoon: "bus-outline" }
              ]}
              waarde={instellingen.filter}
              onKies={(filter) => zetInstellingen({ filter })}
            />
          </Regel>
        </Sectie>

        <Sectie titel="LOCATIE">
          <Regel label="Afstand voor Dichtbij" uitleg={`Haltes tot ${afstand(instellingen.straal)} van je locatie.`}>
            <Chips<string>
              opties={[500, 1000, 1500, 3000].map((m) => ({ key: String(m), label: afstand(m) }))}
              waarde={String(instellingen.straal)}
              onKies={(m) => zetInstellingen({ straal: Number(m) })}
            />
          </Regel>
          <View style={scheiding}>
            <Regel
              label="Thuislocatie"
              uitleg={
                instellingen.thuis
                  ? `${instellingen.thuis.naam}${instellingen.thuis.plaats ? `, ${instellingen.thuis.plaats}` : ""} — gebruikt als je locatie uit staat.`
                  : "Niet ingesteld. Wordt gebruikt als je locatie uit staat."
              }
            />
            <Link icoon="home-outline" label={instellingen.thuis ? "Andere halte kiezen" : "Kies een halte als thuislocatie"} onPress={() => router.push({ pathname: "/zoek", params: { doel: "thuis" } })} />
            {instellingen.thuis ? <Link icoon="close-circle-outline" label="Thuislocatie wissen" onPress={() => zetInstellingen({ thuis: null })} gevaar /> : null}
          </View>
        </Sectie>

        <Sectie titel="OVER">
          <Link icoon="globe-outline" label="ovspot.nl — live OV-kaart" onPress={() => Linking.openURL("https://ovspot.nl")} />
          <View style={scheiding}>
            <Link icoon="chatbubble-ellipses-outline" label="Feedback sturen" onPress={() => Linking.openURL("https://ovspot.nl/contact")} />
          </View>
          <View style={[s.regel, scheiding]}>
            <Text style={[s.uitleg, { color: colors.sub }]}>
              OVspot {versie}
              {update}
              {"\n"}Vertrektijden en ritinformatie via OVspot. Live posities uit open OV-data (NDOV), dienstregeling uit GTFS.
            </Text>
          </View>
        </Sectie>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  lijst: { padding: 12, gap: 18, paddingBottom: 32 },
  sectieTitel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, paddingHorizontal: 4 },
  sectieKaart: {},
  regel: { padding: 16 },
  label: { fontSize: 16, fontWeight: "700" },
  uitleg: { fontSize: 14, marginTop: 3, lineHeight: 20 },
  link: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16 },
  linkText: { flex: 1, fontSize: 16 }
});
