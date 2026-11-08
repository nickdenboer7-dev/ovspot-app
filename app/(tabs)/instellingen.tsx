import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import * as Updates from "expo-updates";
import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Chips, Kaart, Kop } from "../../components/ui";
import { FeedbackModal } from "../../components/FeedbackModal";
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
  const { colors, instellingen, zetInstellingen, laatsteFeedbackContext } = useApp();
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const feedbackContext = laatsteFeedbackContext
    && Date.now() - laatsteFeedbackContext.vastgelegdOp < 30 * 60 * 1000
    ? {
        view: laatsteFeedbackContext.view,
        stop_id: laatsteFeedbackContext.stop_id,
        stop_name: laatsteFeedbackContext.stop_name,
        rit_id: laatsteFeedbackContext.rit_id,
        rit_datum: laatsteFeedbackContext.rit_datum
      }
    : { view: "instellingen" as const };
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
              vol
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
              vol
              waarde={instellingen.filter}
              onKies={(filter) => zetInstellingen({ filter })}
            />
          </Regel>
        </Sectie>

        <Sectie titel="LOCATIE">
          <Regel label="Afstand voor Dichtbij" uitleg={`Haltes tot ${afstand(instellingen.straal)} van je locatie.`}>
            <Chips<string>
              opties={[500, 1000, 1500, 3000].map((m) => ({ key: String(m), label: afstand(m) }))}
              vol
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
            <Link icoon="chatbubble-ellipses-outline" label="Feedback sturen" onPress={() => setFeedbackOpen(true)} />
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
      <FeedbackModal zichtbaar={feedbackOpen} onSluit={() => setFeedbackOpen(false)} context={feedbackContext} />
    </View>
  );
}

const s = StyleSheet.create({
  lijst: { padding: 16, gap: 20, paddingBottom: 34 },
  sectieTitel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.05, paddingHorizontal: 4 },
  sectieKaart: { borderRadius: 16 },
  regel: { paddingHorizontal: 16, paddingVertical: 17 },
  label: { fontSize: 15, fontWeight: "700" },
  uitleg: { fontSize: 13, marginTop: 4, lineHeight: 19 },
  link: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 54, paddingHorizontal: 16 },
  linkText: { flex: 1, fontSize: 15, fontWeight: "500" }
});
