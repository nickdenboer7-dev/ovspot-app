import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { StoringKaart } from "../../components/StoringKaart";
import { Chips, FoutBalk, Kop, Laden, Leeg } from "../../components/ui";
import { useApp } from "../../context/AppProvider";
import { api } from "../../lib/api";
import { usePolling } from "../../lib/hooks";

type Bereik = "mijn" | "alles";

export default function Storingen() {
  const { colors, favorieten, dichtbijIds, storingenMijn } = useApp();
  const [bereik, setBereik] = useState<Bereik>("mijn");

  // "Mijn haltes" = favorieten. "Alles" = favorieten + haltes onder Dichtbij.
  const ids = useMemo(() => {
    const fav = favorieten.map((f) => f.id);
    return bereik === "mijn" ? fav : Array.from(new Set([...fav, ...dichtbijIds])).slice(0, 30);
  }, [bereik, favorieten, dichtbijIds]);

  const key = `${bereik}:${ids.join(",")}`;
  const poll = usePolling(key, () => (ids.length ? api.storingen(ids) : Promise.resolve(null)), 60_000);
  const lijst = poll.data?.storingen ?? [];
  const mislukt = poll.data?.niet_geladen ?? 0;
  const gecontroleerd = poll.data?.gecontroleerd ?? Math.max(0, ids.length - mislukt);

  let inhoud: React.ReactNode;
  if (!ids.length) {
    inhoud =
      bereik === "mijn" ? (
        <Leeg icoon="star-outline" titel="Nog geen favorieten" tekst="Storingen bij je favoriete haltes verschijnen hier. Kies 'Alles' voor haltes dichtbij." />
      ) : (
        <Leeg icoon="location-outline" titel="Nog geen haltes" tekst="Open eerst Dichtbij, dan zie je hier de storingen bij haltes om je heen." />
      );
  } else if (poll.laden && !poll.data) {
    inhoud = <Laden />;
  } else if (!poll.data && poll.fout) {
    inhoud = <Leeg icoon="cloud-offline-outline" titel="Kan storingen niet laden" tekst={poll.fout} knop={{ label: "Opnieuw", onPress: () => void poll.verversen() }} />;
  } else if (!lijst.length && poll.fout) {
    inhoud = (
      <Leeg icoon="cloud-offline-outline" titel="Storingsstatus niet bevestigd"
        tekst="De nieuwste controle is mislukt. Eerdere resultaten kunnen verouderd zijn."
        knop={{ label: "Opnieuw controleren", onPress: () => void poll.verversen() }} />
    );
  } else if (!lijst.length && mislukt > 0) {
    inhoud = (
      <Leeg icoon="alert-circle-outline" titel="Storingsoverzicht onvolledig"
        tekst={`Gecontroleerd: ${gecontroleerd} van ${ids.length} haltes. Een deel van de storingsbron is niet bereikbaar.`}
        knop={{ label: "Opnieuw controleren", onPress: () => void poll.verversen() }} />
    );
  } else if (!lijst.length) {
    inhoud = <Leeg icoon="checkmark-circle-outline" titel="Geen gemelde storingen"
      tekst={`Geen meldingen gevonden voor ${gecontroleerd} gecontroleerde halte${gecontroleerd === 1 ? "" : "s"}. Dit betekent niet automatisch dat alle ritten op tijd rijden.`} />;
  } else {
    inhoud = lijst.map((st) => <StoringKaart key={st.id} st={st} />);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Kop groot titel="Storingen" />
      <View style={[s.chips, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Chips<Bereik>
          opties={[
            { key: "mijn", label: storingenMijn ? `Mijn haltes · ${storingenMijn}` : "Mijn haltes" },
            { key: "alles", label: "Alles" }
          ]}
          waarde={bereik}
          onKies={setBereik}
        />
      </View>
      <ScrollView contentContainerStyle={s.lijst} refreshControl={<RefreshControl refreshing={false} onRefresh={() => void poll.verversen()} colors={[colors.accent]} />}>
        {poll.fout && poll.data ? <FoutBalk tekst={poll.fout} /> : null}
        {mislukt > 0 && lijst.length > 0 ? (
          <FoutBalk tekst={`Storingen onvolledig: ${mislukt} van ${ids.length} haltes niet gecontroleerd`} />
        ) : null}
        {inhoud}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  chips: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth * 2 },
  lijst: { padding: 12, gap: 12, paddingBottom: 24 }
});
