import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import * as Updates from "expo-updates";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { Text } from "../../components/LocalizedText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FeedbackModal } from "../../components/FeedbackModal";
import { Kop } from "../../components/ui";
import { useApp } from "../../context/AppProvider";
import type { Startscherm, Thema } from "../../lib/types";
import type { TaalVoorkeur } from "../../lib/i18n";

type Icoon = keyof typeof Ionicons.glyphMap;
type Kiezer = "thema" | "taal" | "startscherm" | null;

const THEMAS: { key: Thema; label: string; icoon: Icoon }[] = [
  { key: "systeem", label: "Systeem", icoon: "phone-portrait-outline" },
  { key: "licht", label: "Licht", icoon: "sunny-outline" },
  { key: "donker", label: "Donker", icoon: "moon-outline" }
];
const TAALOPTIES: { key: TaalVoorkeur; label: string; icoon: Icoon }[] = [
  { key: "auto", label: "Automatisch", icoon: "phone-portrait-outline" },
  { key: "nl", label: "Nederlands", icoon: "language-outline" },
  { key: "en", label: "English", icoon: "language-outline" }
];
const STARTSCHERMEN: { key: Startscherm; label: string; icoon: Icoon }[] = [
  { key: "index", label: "Dichtbij", icoon: "location-outline" },
  { key: "favorieten", label: "Favorieten", icoon: "star-outline" },
  { key: "storingen", label: "Storingen", icoon: "alert-circle-outline" }
];

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  const { colors, scheme } = useApp();
  return (
    <View style={s.sectie}>
      <Text style={[s.sectieTitel, { color: colors.sub }]} accessibilityRole="header">{titel}</Text>
      <View style={[s.kaart, { backgroundColor: scheme === "dark" ? "#1E293B" : colors.surface, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function InstellingsRij({ icoon, titel, uitleg, waarde, onPress, schakel, laatste = false }: {
  icoon: Icoon;
  titel: string;
  uitleg: string;
  waarde?: string;
  onPress?: () => void;
  schakel?: { value: boolean; onChange: (next: boolean) => void };
  laatste?: boolean;
}) {
  const { colors, scheme, t } = useApp();
  return (
    <Pressable onPress={onPress} disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={onPress ? t(`${titel}, ${waarde || uitleg}`) : undefined}
      style={[s.rij, !laatste && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={[s.icoonAchtergrond, { backgroundColor: scheme === "dark" ? "#334155" : colors.surface2 }]}>
        <Ionicons name={icoon} size={21} color={colors.accent} />
      </View>
      <View style={s.rijTekst}>
        <Text style={[s.rijTitel, { color: colors.text }]}>{titel}</Text>
        <Text style={[s.rijUitleg, { color: colors.sub }]}>{uitleg}</Text>
      </View>
      {schakel ? (
        <Switch
          accessibilityLabel={t(titel)}
          value={schakel.value}
          onValueChange={schakel.onChange}
          trackColor={{ false: colors.border, true: scheme === "dark" ? "#0E7490" : "#7DD3FC" }}
          thumbColor={schakel.value ? colors.accent : colors.muted}
        />
      ) : (
        <View style={s.rechterDeel}>
          {waarde ? <Text style={[s.waarde, { color: colors.sub }]} numberOfLines={1}>{waarde}</Text> : null}
          <Ionicons name="chevron-forward" size={19} color={colors.muted} />
        </View>
      )}
    </Pressable>
  );
}

export default function Instellingen() {
  const { colors, scheme, instellingen, zetInstellingen, laatsteFeedbackContext, t } = useApp();
  const insets = useSafeAreaInsets();
  const [kiezer, zetKiezer] = useState<Kiezer>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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
  const versie = Constants.nativeAppVersion || Constants.expoConfig?.version || "1.0.0";
  const otaId = Updates.updateId ? Updates.updateId.slice(0, 8) : "ingebouwd";
  const opties = kiezer === "thema" ? THEMAS : kiezer === "taal" ? TAALOPTIES : STARTSCHERMEN;
  const geselecteerd = kiezer === "thema" ? instellingen.thema : kiezer === "taal" ? instellingen.taalVoorkeur : instellingen.startscherm;

  return (
    <View style={{ flex: 1, backgroundColor: scheme === "dark" ? "#0F172A" : colors.background }}>
      <Kop groot titel="Instellingen" />
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.lijst, { paddingBottom: Math.max(insets.bottom, 12) + 28 }]}>
        <Sectie titel="WEERGAVE & GEDRAG">
          <InstellingsRij icoon="color-palette-outline" titel="Thema"
            uitleg="Donker, licht of systeem" waarde={THEMAS.find(o => o.key === instellingen.thema)?.label || "Systeem"}
            onPress={() => zetKiezer("thema")} />
          <InstellingsRij icoon="language-outline" titel="Taal"
            uitleg="Taal van je telefoon of zelf kiezen"
            waarde={TAALOPTIES.find(o => o.key === instellingen.taalVoorkeur)?.label || "Automatisch"}
            onPress={() => zetKiezer("taal")} />
          <InstellingsRij icoon="apps-outline" titel="Startscherm"
            uitleg="Kies welk scherm als eerste opstart"
            waarde={STARTSCHERMEN.find(o => o.key === instellingen.startscherm)?.label || "Dichtbij"}
            onPress={() => zetKiezer("startscherm")} />
          <InstellingsRij icoon="phone-portrait-outline" titel="Scherm aanhouden"
            uitleg="Voorkom dat het scherm uitgaat"
            schakel={{ value: instellingen.schermAanhouden,
              onChange: schermAanhouden => zetInstellingen({ schermAanhouden }) }} laatste />
        </Sectie>

        <Sectie titel="KAART & DATA">
          <InstellingsRij icoon="bus-outline" titel="Live voertuigen"
            uitleg="Toon bussen en treinen op de achtergrond"
            schakel={{ value: instellingen.liveVoertuigen,
              onChange: liveVoertuigen => zetInstellingen({ liveVoertuigen }) }} />
          <InstellingsRij icoon="cellular-outline" titel="Databesparing"
            uitleg="Minder vaak kaartgegevens en GPS verversen"
            schakel={{ value: instellingen.databesparing,
              onChange: databesparing => zetInstellingen({ databesparing }) }} />
          <InstellingsRij icoon="options-outline" titel="Locatie & haltebord"
            uitleg="Afstand, thuislocatie en standaardfilter"
            onPress={() => router.push("/instellingen-geavanceerd")} laatste />
        </Sectie>

        <Sectie titel="MELDINGEN">
          <InstellingsRij icoon="notifications-outline" titel="Storingen"
            uitleg="Pushberichten bij vertragingen op favoriete lijnen"
            schakel={{ value: instellingen.storingenPush,
              onChange: storingenPush => zetInstellingen({ storingenPush }) }} laatste />
        </Sectie>

        <Sectie titel="OVER OVSPOT">
          <InstellingsRij icoon="chatbubble-ellipses-outline" titel="Stuur feedback"
            uitleg="Meld een bug of geef een suggestie"
            onPress={() => setFeedbackOpen(true)} />
          <InstellingsRij icoon="information-circle-outline" titel="Over de app"
            uitleg="Licenties en algemene voorwaarden"
            onPress={() => router.push("/info")} laatste />
        </Sectie>

        <Text style={[s.versie, { color: colors.muted }]}>
          Versie {versie} (OTA: {otaId})
        </Text>
      </ScrollView>

      <Modal visible={kiezer !== null} transparent animationType="fade"
        onRequestClose={() => zetKiezer(null)}>
        <View style={s.modalAchtergrond}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => zetKiezer(null)}
            accessibilityRole="button" accessibilityLabel={t("Keuzemenu sluiten")} />
          <View style={[s.modalKaart, { backgroundColor: scheme === "dark" ? "#1E293B" : colors.surface, borderColor: colors.border }]}>
            <Text style={[s.modalTitel, { color: colors.text }]}>
              {kiezer === "thema" ? "Kies thema" : kiezer === "taal" ? "Kies taal" : "Kies startscherm"}
            </Text>
            {opties.map(item => {
              const actief = item.key === geselecteerd;
              return (
                <Pressable key={item.key} accessibilityRole="radio"
                  accessibilityState={{ checked: actief }}
                  onPress={() => {
                    if (kiezer === "thema") zetInstellingen({ thema: item.key as Thema });
                    else if (kiezer === "taal") zetInstellingen({ taalVoorkeur: item.key as TaalVoorkeur });
                    else zetInstellingen({ startscherm: item.key as Startscherm });
                    zetKiezer(null);
                  }}
                  style={[s.modalOptie, { borderColor: colors.border },
                    actief && { backgroundColor: colors.infoBg }]}>
                  <Ionicons name={item.icoon} size={21} color={actief ? colors.accent : colors.sub} />
                  <Text style={[s.modalOptieTekst, { color: colors.text }]}>{item.label}</Text>
                  {actief ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      <FeedbackModal zichtbaar={feedbackOpen} onSluit={() => setFeedbackOpen(false)} context={feedbackContext} />
    </View>
  );
}

const s = StyleSheet.create({
  lijst: { padding: 16, gap: 22 },
  sectie: { gap: 10 },
  sectieTitel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginLeft: 6 },
  kaart: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  rij: { flexDirection: "row", alignItems: "center", minHeight: 75, paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  icoonAchtergrond: { height: 39, width: 39, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rijTekst: { flex: 1, minWidth: 0, gap: 4 },
  rijTitel: { fontSize: 15, fontWeight: "700" },
  rijUitleg: { fontSize: 12, lineHeight: 17 },
  rechterDeel: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 112 },
  waarde: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  versie: { marginTop: 0, textAlign: "center", fontSize: 11, lineHeight: 18 },
  modalAchtergrond: { flex: 1, justifyContent: "center", paddingHorizontal: 28, backgroundColor: "rgba(2,6,23,0.65)" },
  modalKaart: { borderRadius: 20, borderWidth: 1, padding: 18, gap: 10, elevation: 12 },
  modalTitel: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  modalOptie: { flexDirection: "row", alignItems: "center", gap: 13, minHeight: 51,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13 },
  modalOptieTekst: { flex: 1, fontSize: 15, fontWeight: "600" }
});
