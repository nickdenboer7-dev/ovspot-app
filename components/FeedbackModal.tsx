import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppProvider";
import { api } from "../lib/api";
import type { FeedbackCategorie, FeedbackContext } from "../lib/types";

const CATEGORIEEN: { key: FeedbackCategorie; label: string }[] = [
  { key: "kaart_data", label: "🗺️ Kaart / Data" },
  { key: "idee", label: "💡 Idee / Wens" },
  { key: "bug", label: "🐛 Bug" },
  { key: "overig", label: "💬 Overig" }
];

type Props = {
  zichtbaar: boolean;
  onSluit: () => void;
  context?: FeedbackContext;
};

function nieuwBerichtId(): string {
  // Per inzending, nooit een blijvend toestel- of installatie-ID.
  return "ofb_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
}

export function FeedbackModal({ zichtbaar, onSluit, context }: Props) {
  const { colors, scheme } = useApp();
  const insets = useSafeAreaInsets();
  const [categorie, zetCategorie] = useState<FeedbackCategorie>("kaart_data");
  const [bericht, zetBericht] = useState("");
  const [email, zetEmail] = useState("");
  const [bezig, zetBezig] = useState(false);
  const [fout, zetFout] = useState("");
  const [geslaagd, zetGeslaagd] = useState(false);
  const lopend = useRef(false);
  const berichtId = useRef<string>("");

  function sluiten() {
    if (lopend.current) return;
    if (geslaagd) {
      zetBericht("");
      zetEmail("");
      zetCategorie("kaart_data");
      zetGeslaagd(false);
      berichtId.current = "";
    }
    zetFout("");
    onSluit();
  }

  async function verzenden() {
    if (lopend.current) return;
    const tekst = bericht.trim();
    if (tekst.length < 10) {
      zetFout("Schrijf minimaal 10 tekens over je melding.");
      return;
    }
    const mail = email.trim();
    if (mail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mail)) {
      zetFout("Controleer het e-mailadres.");
      return;
    }
    if (!berichtId.current) berichtId.current = nieuwBerichtId();
    lopend.current = true;
    zetBezig(true);
    zetFout("");
    try {
      await api.feedback({
        client_id: berichtId.current,
        category: categorie,
        message: tekst,
        contact: mail,
        app_version: Constants.nativeAppVersion || Constants.expoConfig?.version || "onbekend",
        ota_version: Updates.updateId || Updates.runtimeVersion || "embedded",
        os_version: `${Platform.OS} ${String(Platform.Version)}`,
        reported_at: new Date().toISOString(),
        context: context ?? { view: "instellingen" }
      });
      zetGeslaagd(true);
    } catch (error) {
      zetFout(error instanceof Error ? error.message : "Verzenden mislukt. Probeer opnieuw.");
    } finally {
      lopend.current = false;
      zetBezig(false);
    }
  }

  return (
    <Modal
      visible={zichtbaar}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={sluiten}
    >
      <KeyboardAvoidingView
        style={s.buiten}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={s.achtergrond} onPress={sluiten}
          accessibilityRole="button" accessibilityLabel="Sluit feedbackvenster" />
        <View style={[s.sheet, {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 14) + 12
        }]}>
          <View style={[s.grip, { backgroundColor: colors.border }]} />
          <View style={s.kop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.titel, { color: colors.text }]}>Feedback sturen</Text>
              <Text style={[s.ondertitel, { color: colors.sub }]}>
                Help OVspot verbeteren
              </Text>
            </View>
            <Pressable onPress={sluiten} disabled={bezig} accessibilityRole="button"
              accessibilityLabel="Sluiten" style={s.sluitKnop}>
              <Ionicons name="close" size={24} color={colors.sub} />
            </Pressable>
          </View>

          {geslaagd ? (
            <View style={s.gelukt}>
              <Ionicons name="checkmark-circle" size={46} color={colors.live} />
              <Text style={[s.geluktTitel, { color: colors.text }]}>Bedankt voor je feedback!</Text>
              <Text style={[s.uitleg, { color: colors.sub, textAlign: "center" }]}>
                Je bericht is ontvangen en staat in de OVspot-feedbackinbox.
              </Text>
              <Pressable onPress={sluiten} style={[s.verzendKnop, { backgroundColor: colors.accent }]}>
                <Text style={[s.verzendTekst, { color: colors.onAccent }]}>Sluiten</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.inhoud} showsVerticalScrollIndicator={false}>
              <Text style={[s.label, { color: colors.text }]}>Waar gaat je bericht over?</Text>
              <View style={s.categorieen}>
                {CATEGORIEEN.map(item => {
                  const geselecteerd = categorie === item.key;
                  return (
                    <Pressable key={item.key}
                      accessibilityRole="radio" accessibilityState={{ checked: geselecteerd }}
                      onPress={() => zetCategorie(item.key)}
                      style={[s.chip, {
                        backgroundColor: geselecteerd ? colors.infoBg : colors.surface2,
                        borderColor: geselecteerd ? colors.accent : colors.border
                      }]}>
                      <Text style={[s.chipTekst, {
                        color: geselecteerd ? colors.infoText : colors.text
                      }]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[s.label, { color: colors.text }]}>Je bericht</Text>
              <TextInput
                value={bericht} onChangeText={zetBericht}
                placeholder="Wat gaat er mis of wat kan beter?"
                placeholderTextColor={colors.muted}
                maxLength={2000}
                multiline textAlignVertical="top"
                accessibilityLabel="Feedbackbericht"
                style={[s.bericht, {
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderColor: colors.border
                }]}
              />
              <Text style={[s.teller, { color: colors.sub }]}>{bericht.length}/2000</Text>

              <Text style={[s.label, { color: colors.text }]}>E-mailadres (optioneel)</Text>
              <TextInput
                value={email} onChangeText={zetEmail}
                placeholder="naam@voorbeeld.nl"
                placeholderTextColor={colors.muted}
                keyboardType="email-address" autoCapitalize="none"
                autoCorrect={false} maxLength={200}
                accessibilityLabel="E-mailadres, optioneel"
                style={[s.email, {
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderColor: colors.border
                }]}
              />
              <Text style={[s.uitleg, { color: colors.sub }]}>
                We sturen app-, OTA- en OS-versie mee, plus de onlangs bekeken halte of rit
                als die beschikbaar is. Geen GPS-coördinaten.
              </Text>

              {fout ? <Text style={[s.fout, { color: colors.red }]} accessibilityRole="alert">{fout}</Text> : null}
              <Pressable
                onPress={() => void verzenden()}
                disabled={bezig || bericht.trim().length < 10}
                accessibilityRole="button"
                accessibilityLabel="Feedback verzenden"
                style={[s.verzendKnop, {
                  backgroundColor: colors.accent,
                  opacity: bezig || bericht.trim().length < 10 ? 0.55 : 1
                }]}>
                {bezig ? <ActivityIndicator size="small" color={colors.onAccent} /> : (
                  <Ionicons name="send-outline" size={18} color={colors.onAccent} />
                )}
                <Text style={[s.verzendTekst, { color: colors.onAccent }]}>
                  {bezig ? "Versturen..." : "Verstuur feedback"}
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  buiten: { flex: 1, justifyContent: "flex-end" },
  achtergrond: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(2,6,23,0.55)"
  },
  sheet: {
    maxHeight: "90%", borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderWidth: 1, paddingHorizontal: 20,
    elevation: 16
  },
  grip: { width: 38, height: 5, borderRadius: 3, alignSelf: "center", marginTop: 9, marginBottom: 18 },
  kop: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 14 },
  titel: { fontSize: 22, fontWeight: "800" },
  ondertitel: { fontSize: 13, marginTop: 4 },
  sluitKnop: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  inhoud: { paddingBottom: 8, gap: 10 },
  label: { fontSize: 14, fontWeight: "700", marginTop: 6 },
  categorieen: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 },
  chip: {
    minWidth: "45%", flexGrow: 1, paddingHorizontal: 12, minHeight: 46,
    borderRadius: 13, borderWidth: 1, justifyContent: "center", alignItems: "center"
  },
  chipTekst: { fontSize: 13, fontWeight: "700" },
  bericht: { borderWidth: 1, borderRadius: 13, minHeight: 134, padding: 13, fontSize: 15, lineHeight: 22 },
  teller: { alignSelf: "flex-end", fontSize: 12, marginTop: -3 },
  email: { borderWidth: 1, borderRadius: 13, height: 49, paddingHorizontal: 13, fontSize: 15 },
  uitleg: { fontSize: 12, lineHeight: 18, marginBottom: 6 },
  fout: { fontSize: 13, fontWeight: "600", marginVertical: 4 },
  verzendKnop: {
    minHeight: 51, borderRadius: 14, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 9, marginTop: 10
  },
  verzendTekst: { fontSize: 15, fontWeight: "800" },
  gelukt: { alignItems: "center", paddingVertical: 22, gap: 13 },
  geluktTitel: { fontSize: 19, fontWeight: "800" }
});
