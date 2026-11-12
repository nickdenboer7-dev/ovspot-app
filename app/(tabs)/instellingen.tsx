import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import * as Updates from "expo-updates";
import React, { useState } from "react";
import { Alert, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { Text } from "../../components/LocalizedText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FeedbackModal } from "../../components/FeedbackModal";
import { Kop } from "../../components/ui";
import { useApp } from "../../context/AppProvider";
import { afstand } from "../../lib/format";
import { DICHTBIJ_AFSTANDEN, STANDAARD_INSTELLINGEN } from "../../lib/instellingenDefaults";
import type { Filter, Startscherm, Tekstgrootte, Thema } from "../../lib/types";
import { EN, type TaalVoorkeur } from "../../lib/i18n";
import { instellingKomtOvereen, instellingenZoektermen } from "../../lib/instellingenZoeken";
import { registreerPush } from "../../lib/push";
import { vergrootLetterwaarden } from "../../lib/toegankelijkheid";

type Icoon = keyof typeof Ionicons.glyphMap;
type Kiezer = "thema" | "taal" | "startscherm" | "tekst" | "afstand" | "filter" | "donkerVan" | "donkerTot" | null;
/** Zonder tijdkiezer-pakket: hele uren. Zoekbalk verschijnt pas als de lijst echt lang wordt. */
const ZOEKBALK_VANAF = 20;

const THEMAS: { key: Thema; label: string; icoon: Icoon }[] = [
  { key: "systeem", label: "Systeem", icoon: "phone-portrait-outline" },
  { key: "licht", label: "Licht", icoon: "sunny-outline" },
  { key: "donker", label: "Donker", icoon: "moon-outline" },
  { key: "schema", label: "Op schema", icoon: "time-outline" }
];
const uurLabel = (u: number) => `${String(u).padStart(2, "0")}:00`;
const DONKER_VAN: { key: string; label: string; icoon: Icoon }[] = [17,18,19,20,21,22,23].map(u => ({ key: String(u), label: uurLabel(u), icoon: "moon-outline" as Icoon }));
const DONKER_TOT: { key: string; label: string; icoon: Icoon }[] = [5,6,7,8,9,10].map(u => ({ key: String(u), label: uurLabel(u), icoon: "sunny-outline" as Icoon }));
const AFSTANDOPTIES: { key: string; label: string; icoon: Icoon }[] = DICHTBIJ_AFSTANDEN.map(m => ({ key: String(m), label: afstand(m), icoon: "locate-outline" as Icoon }));
const FILTEROPTIES: { key: Filter; label: string; icoon: Icoon }[] = [
  { key: "alles", label: "Alles", icoon: "apps-outline" },
  { key: "trein", label: "Trein", icoon: "train-outline" },
  { key: "bus", label: "Bus", icoon: "bus-outline" }
];
const TAALOPTIES: { key: TaalVoorkeur; label: string; icoon: Icoon }[] = [
  { key: "auto", label: "Automatisch", icoon: "phone-portrait-outline" },
  { key: "nl", label: "Nederlands", icoon: "language-outline" },
  { key: "en", label: "English", icoon: "language-outline" }
];
const TEKSTGROOTTES: { key: Tekstgrootte; label: string; icoon: Icoon }[] = [
  { key: "klein", label: "Klein", icoon: "text-outline" },
  { key: "normaal", label: "Normaal", icoon: "text-outline" },
  { key: "groot", label: "Groot", icoon: "text-outline" }
];
const STARTSCHERMEN: { key: Startscherm; label: string; icoon: Icoon }[] = [
  { key: "index", label: "Dichtbij", icoon: "location-outline" },
  { key: "favorieten", label: "Favorieten", icoon: "star-outline" },
  { key: "storingen", label: "Storingen", icoon: "alert-circle-outline" }
];

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  const { colors, scheme, instellingen } = useApp();
  return (
    <View style={s.sectie}>
      <Text style={[s.sectieTitel, { color: colors.sub }]} accessibilityRole="header">{titel}</Text>
      <View style={[s.kaart, { backgroundColor: !instellingen.hoogContrast && scheme === "dark" ? colors.surface2 : colors.surface, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

type RijProps = {
  icoon: Icoon;
  titel: string;
  uitleg: string;
  waarde?: string;
  onPress?: () => void;
  schakel?: { value: boolean; onChange: (next: boolean) => void };
  laatste?: boolean;
};

function InstellingsRij({ icoon, titel, uitleg, waarde, onPress, schakel, laatste = false }: RijProps) {
  const { colors, scheme, instellingen, t } = useApp();
  // In de grotere-tekststand mag een lange gekozen waarde nooit 'Automatis…' worden.
  const waardeOnder = instellingen.groteTekst && !!waarde && !!onPress;
  const rijStijl = [s.rij, !laatste && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }];
  const inhoud = (
    <>
      <View style={[s.icoonAchtergrond, { backgroundColor: !instellingen.hoogContrast && scheme === "dark" ? colors.border : colors.surface2 }]}>
        <Ionicons name={icoon} size={21} color={colors.accent} />
      </View>
      <View style={s.rijTekst}>
        <Text style={[s.rijTitel, { color: colors.text }]}>{titel}</Text>
        <Text style={[s.rijUitleg, { color: colors.sub }]}>{uitleg}</Text>
        {waardeOnder ? (
          <View style={s.waardeOnder}>
            <Text style={[s.waarde, { color: colors.sub }]}>{waarde}</Text>
            <Ionicons name="chevron-forward" size={19} color={colors.muted} />
          </View>
        ) : null}
      </View>
      {schakel ? (
        <Switch
          accessibilityLabel={t(titel)}
          value={schakel.value}
          onValueChange={schakel.onChange}
          trackColor={{ false: colors.border, true: colors.switchOn }}
          thumbColor={schakel.value ? colors.accent : colors.muted}
        />
      ) : !waardeOnder ? (
        <View style={s.rechterDeel}>
          {waarde ? <Text style={[s.waarde, { color: colors.sub }]} numberOfLines={1}>{waarde}</Text> : null}
          <Ionicons name="chevron-forward" size={19} color={colors.muted} />
        </View>
      ) : null}
    </>
  );
  return schakel ? <View style={rijStijl}>{inhoud}</View> : (
    <Pressable onPress={onPress ? () => { Keyboard.dismiss(); onPress(); } : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${t(titel)}, ${t(waarde || uitleg)}`}
      style={rijStijl}>
      {inhoud}
    </Pressable>
  );
}

export default function Instellingen() {
  const { colors, scheme, instellingen, zetInstellingen, laatsteFeedbackContext, favorietenLijnen, t } = useApp();
  const insets = useSafeAreaInsets();
  const [kiezer, zetKiezer] = useState<Kiezer>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [zoektekst, zetZoektekst] = useState("");
  const [meerOpen, zetMeerOpen] = useState(false);
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
  const KIEZERS: Record<string, { titel: string; opties: { key: string; label: string; icoon: Icoon }[]; huidig: string }> = {
    thema: { titel: "Kies thema", opties: THEMAS, huidig: instellingen.thema },
    taal: { titel: "Kies taal", opties: TAALOPTIES, huidig: instellingen.taalVoorkeur },
    tekst: { titel: "Kies tekstgrootte", opties: TEKSTGROOTTES, huidig: instellingen.tekstgrootte },
    startscherm: { titel: "Kies startscherm", opties: STARTSCHERMEN, huidig: instellingen.startscherm },
    afstand: { titel: "Zoekafstand voor Dichtbij", opties: AFSTANDOPTIES, huidig: String(instellingen.straal) },
    filter: { titel: "Standaard haltefilter", opties: FILTEROPTIES, huidig: instellingen.filter },
    donkerVan: { titel: "Donker vanaf", opties: DONKER_VAN, huidig: String(instellingen.donkerVan) },
    donkerTot: { titel: "Donker tot", opties: DONKER_TOT, huidig: String(instellingen.donkerTot) }
  };
  const kiezerInfo = kiezer ? KIEZERS[kiezer] : null;
  const opties = kiezerInfo?.opties ?? [];
  const geselecteerd = kiezerInfo?.huidig;
  const zetMeldingen = async (aan: boolean) => {
    try {
      const gelukt = await registreerPush(favorietenLijnen, aan);
      if (aan && !gelukt) {
        Alert.alert(t("Meldingen staan uit"), t("Geef OVspot toestemming voor meldingen in de instellingen van je telefoon."));
        return;
      }
      zetInstellingen({ storingenPush: aan });
    } catch {
      Alert.alert(t("Meldingen niet gelukt"), t("Controleer je verbinding en probeer het opnieuw."));
    }
  };
  const zetStandaard = () => Alert.alert(
    t("Standaard terugzetten"), t("Alle instellingen gaan terug naar de standaard. Je thuislocatie blijft staan."),
    [{ text: t("Annuleren"), style: "cancel" },
     { text: t("Terugzetten"), style: "destructive", onPress: () => zetInstellingen({ ...STANDAARD_INSTELLINGEN, thuis: instellingen.thuis }) }]);

  const termen = instellingenZoektermen(zoektekst);
  const zoekt = termen.length > 0;
  const secties: { titel: string; meer?: true; rijen: React.ReactElement<RijProps>[] }[] = [
    { titel: "WEERGAVE", rijen: [
      <InstellingsRij key="thema" icoon="color-palette-outline" titel="Thema"
        uitleg="Donker, licht of systeem" waarde={THEMAS.find(o => o.key === instellingen.thema)?.label || "Systeem"}
        onPress={() => zetKiezer("thema")} />,
      ...(instellingen.thema === "schema" ? [
        <InstellingsRij key="donkerVan" icoon="moon-outline" titel="Donker vanaf"
          uitleg="Vanaf dit uur schakelt de app naar donker" waarde={uurLabel(instellingen.donkerVan)}
          onPress={() => zetKiezer("donkerVan")} />,
        <InstellingsRij key="donkerTot" icoon="sunny-outline" titel="Donker tot"
          uitleg="Vanaf dit uur is de app weer licht" waarde={uurLabel(instellingen.donkerTot)}
          onPress={() => zetKiezer("donkerTot")} />,
      ] : []),
      <InstellingsRij key="tekst" icoon="text-outline" titel="Tekstgrootte"
        uitleg="Kleiner of groter lettertype in de hele app"
        waarde={TEKSTGROOTTES.find(o => o.key === instellingen.tekstgrootte)?.label || "Normaal"}
        onPress={() => zetKiezer("tekst")} />,
      <InstellingsRij key="contrast" icoon="contrast-outline" titel="Hoog contrast"
        uitleg="Duidelijker onderscheid tussen tekst en achtergrond"
        schakel={{ value: instellingen.hoogContrast,
          onChange: hoogContrast => zetInstellingen({ hoogContrast }) }} />,
    ] },
    { titel: "LOCATIE", rijen: [
      <InstellingsRij key="afstand" icoon="locate-outline" titel="Zoekafstand"
        uitleg="Afstand voor Dichtbij" waarde={afstand(instellingen.straal)}
        onPress={() => zetKiezer("afstand")} />,
      <InstellingsRij key="thuis" icoon="home-outline" titel="Thuislocatie"
        uitleg="Wordt gebruikt wanneer locatie uitstaat"
        waarde={instellingen.thuis ? instellingen.thuis.naam : "Niet ingesteld"}
        onPress={() => router.push({ pathname: "/zoek", params: { doel: "thuis" } })} />,
      <InstellingsRij key="filter" icoon="options-outline" titel="Standaard haltefilter"
        uitleg="Zo opent het vertrekbord"
        waarde={FILTEROPTIES.find(o => o.key === instellingen.filter)?.label || "Alles"}
        onPress={() => zetKiezer("filter")} />,
    ] },
    { titel: "DICHTBIJ", rijen: [
      <InstellingsRij key="previews" icoon="time-outline" titel="Vertrektijden op haltekaarten"
        uitleg="Toon de eerste twee vertrekken"
        schakel={{ value: instellingen.toonVertrekpreviews,
          onChange: toonVertrekpreviews => zetInstellingen({ toonVertrekpreviews }) }} />,
      <InstellingsRij key="start" icoon="apps-outline" titel="Startscherm"
        uitleg="Kies welk scherm als eerste opstart"
        waarde={STARTSCHERMEN.find(o => o.key === instellingen.startscherm)?.label || "Dichtbij"}
        onPress={() => zetKiezer("startscherm")} />,
    ] },
    { titel: "MELDINGEN", rijen: [
      <InstellingsRij key="storingenPush" icoon="notifications-outline" titel="Storingen en vertraging"
        uitleg="Pushbericht bij storing of 3+ minuten vertraging op je favoriete lijnen"
        schakel={{ value: instellingen.storingenPush, onChange: zetMeldingen }} />,
    ] },
    { titel: "KAART & DATA", meer: true, rijen: [
      <InstellingsRij key="voertuigen" icoon="bus-outline" titel="Live voertuigen"
        uitleg="Toon bussen en treinen op de achtergrond"
        schakel={{ value: instellingen.liveVoertuigen,
          onChange: liveVoertuigen => zetInstellingen({ liveVoertuigen }) }} />,
      <InstellingsRij key="data" icoon="cellular-outline" titel="Databesparing"
        uitleg="Minder vaak kaartgegevens en GPS verversen"
        schakel={{ value: instellingen.databesparing,
          onChange: databesparing => zetInstellingen({ databesparing }) }} />,
    ] },
    { titel: "GEDRAG", meer: true, rijen: [
      <InstellingsRij key="taal" icoon="language-outline" titel="Taal"
        uitleg="Taal van je telefoon of zelf kiezen"
        waarde={TAALOPTIES.find(o => o.key === instellingen.taalVoorkeur)?.label || "Automatisch"}
        onPress={() => zetKiezer("taal")} />,
      <InstellingsRij key="scherm" icoon="phone-portrait-outline" titel="Scherm aanhouden"
        uitleg="Voorkom dat het scherm uitgaat"
        schakel={{ value: instellingen.schermAanhouden,
          onChange: schermAanhouden => zetInstellingen({ schermAanhouden }) }} />,
    ] },
    { titel: "OVER OVSPOT", meer: true, rijen: [
      <InstellingsRij key="feedback" icoon="chatbubble-ellipses-outline" titel="Stuur feedback"
        uitleg="Meld een bug of geef een suggestie"
        onPress={() => setFeedbackOpen(true)} />,
      <InstellingsRij key="over" icoon="information-circle-outline" titel="Over de app"
        uitleg="Licenties en algemene voorwaarden"
        onPress={() => router.push("/info")} />,
      <InstellingsRij key="reset" icoon="refresh-outline" titel="Standaard terugzetten"
        uitleg="Alle instellingen terug naar de beginwaarden"
        onPress={zetStandaard} />,
    ] },
  ];
  const zichtbaar = secties.map(({ titel, meer, rijen }) => ({
    titel,
    meer,
    rijen: rijen.filter(({ props }) => {
      const velden = [props.titel, props.uitleg, titel];
      return instellingKomtOvereen(termen, props.titel, props.uitleg, titel,
        ...velden.map(veld => EN[veld] ?? veld));
    })
  })).filter(({ rijen }) => rijen.length > 0);
  const aantalRijen = secties.reduce((n, sec) => n + sec.rijen.length, 0);
  const toonZoekbalk = aantalRijen > ZOEKBALK_VANAF || zoekt;
  const zoeklabel = t("Zoek in instellingen");
  const toonSecties = (meer: boolean) => zichtbaar.filter(sectie => !!sectie.meer === meer)
    .map(({ titel, rijen }) => (
      <React.Fragment key={titel}>
        <Sectie titel={titel}>
          {rijen.map((rij, index) => React.cloneElement(rij, { laatste: index === rijen.length - 1 }))}
        </Sectie>
      </React.Fragment>
    ));

  return (
    <View style={{ flex: 1, backgroundColor: !instellingen.hoogContrast && scheme === "dark" ? colors.header : colors.background }}>
      <Kop groot titel="Instellingen" />
      <ScrollView showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.lijst, { paddingBottom: Math.max(insets.bottom, 12) + 28 }]}>
        {toonZoekbalk ? <View style={[s.zoekbalk, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={21} color={colors.sub} />
          <TextInput
            accessibilityLabel={zoeklabel}
            placeholder={zoeklabel}
            placeholderTextColor={colors.sub}
            value={zoektekst}
            onChangeText={zetZoektekst}
            autoCapitalize="none"
            returnKeyType="search"
            style={[s.zoekveld, { color: colors.text }, vergrootLetterwaarden(16, undefined, instellingen.groteTekst)]}
          />
          {zoektekst ? (
            <Pressable style={s.wisZoekveld} accessibilityRole="button"
              accessibilityLabel={t("Wis zoekterm")} onPress={() => zetZoektekst("")}>
              <Ionicons name="close-outline" size={23} color={colors.sub} />
            </Pressable>
          ) : null}
        </View> : null}
        {toonSecties(false)}
        {!zoekt ? (
          <Pressable onPress={() => zetMeerOpen(open => !open)}
            accessibilityRole="button" accessibilityState={{ expanded: meerOpen }}
            accessibilityLabel={t("Meer instellingen")}
            style={[s.meerKnop, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name={meerOpen ? "chevron-down" : "chevron-forward"} size={19} color={colors.accent} />
            <Text style={[s.meerTekst, { color: colors.accent }]}>Meer instellingen</Text>
          </Pressable>
        ) : null}
        {zoekt || meerOpen ? toonSecties(true) : null}
        {zichtbaar.length === 0 ? (
          <Text style={[s.geenResultaat, { color: colors.sub }]} accessibilityLiveRegion="polite">
            Geen instellingen gevonden.
          </Text>
        ) : null}
        {!zoekt ? <Text style={[s.versie, { color: colors.muted }]}>
          Versie {versie} (OTA: {otaId})
        </Text> : null}
      </ScrollView>

      <Modal visible={kiezer !== null} transparent animationType="fade"
        onRequestClose={() => zetKiezer(null)}>
        <View style={s.modalAchtergrond}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => zetKiezer(null)}
            accessibilityRole="button" accessibilityLabel={t("Keuzemenu sluiten")} />
          <View style={[s.modalKaart, { backgroundColor: !instellingen.hoogContrast && scheme === "dark" ? colors.surface2 : colors.surface, borderColor: colors.border }]}>
            <Text style={[s.modalTitel, { color: colors.text }]}>
              {kiezerInfo?.titel}
            </Text>
            {opties.map(item => {
              const actief = item.key === geselecteerd;
              return (
                <Pressable key={item.key} accessibilityRole="radio"
                  accessibilityState={{ checked: actief }}
                  onPress={() => {
                    if (kiezer === "thema") zetInstellingen({ thema: item.key as Thema });
                    else if (kiezer === "taal") zetInstellingen({ taalVoorkeur: item.key as TaalVoorkeur });
                    else if (kiezer === "tekst") zetInstellingen({ tekstgrootte: item.key as Tekstgrootte, groteTekst: item.key === "groot" });
                    else if (kiezer === "afstand") zetInstellingen({ straal: Number(item.key) });
                    else if (kiezer === "filter") zetInstellingen({ filter: item.key as Filter });
                    else if (kiezer === "donkerVan") zetInstellingen({ donkerVan: Number(item.key) });
                    else if (kiezer === "donkerTot") zetInstellingen({ donkerTot: Number(item.key) });
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
  lijst: { padding: 16, gap: 16 },
  zoekbalk: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 14,
    paddingRight: 6, minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14 },
  zoekveld: { flex: 1, minWidth: 0, paddingVertical: 10, fontSize: 16 },
  wisZoekveld: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  geenResultaat: { fontSize: 15, paddingHorizontal: 6 },
  sectie: { gap: 10 },
  sectieTitel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginLeft: 6 },
  kaart: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  rij: { flexDirection: "row", alignItems: "center", minHeight: 64, paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  icoonAchtergrond: { height: 39, width: 39, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rijTekst: { flex: 1, minWidth: 0, gap: 4 },
  rijTitel: { fontSize: 15, fontWeight: "700" },
  rijUitleg: { fontSize: 12, lineHeight: 17 },
  rechterDeel: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 112 },
  waardeOnder: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, marginTop: 4 },
  waarde: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  meerKnop: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14,
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, paddingVertical: 8 },
  meerTekst: { fontSize: 14, fontWeight: "700" },
  versie: { marginTop: 0, textAlign: "center", fontSize: 11, lineHeight: 18 },
  modalAchtergrond: { flex: 1, justifyContent: "center", paddingHorizontal: 28, backgroundColor: "rgba(2,6,23,0.65)" },
  modalKaart: { borderRadius: 20, borderWidth: 1, padding: 18, gap: 10, elevation: 12 },
  modalTitel: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  modalOptie: { flexDirection: "row", alignItems: "center", gap: 13, minHeight: 51,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13 },
  modalOptieTekst: { flex: 1, fontSize: 15, fontWeight: "600" }
});
