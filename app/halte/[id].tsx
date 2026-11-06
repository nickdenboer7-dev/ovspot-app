import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { isTab, OnderBalk } from "../../components/OnderBalk";
import { StoringKaart } from "../../components/StoringKaart";
import { Chips, FoutBalk, Kaart, Kop, KopKnop, Laden, Leeg } from "../../components/ui";
import { VertrekRegel } from "../../components/VertrekRegel";
import { useApp } from "../../context/AppProvider";
import { api } from "../../lib/api";
import { klok } from "../../lib/format";
import { useNu, usePolling } from "../../lib/hooks";
import type { Filter, Vertrek } from "../../lib/types";

export default function Haltebord() {
  const p = useLocalSearchParams<{ id: string; van?: string; naam?: string; plaats?: string; groep?: string }>();
  const id = String(p.id || "");
  const van = isTab(p.van) ? p.van : "index";
  const { colors, instellingen, isFavoriet, wisselFavoriet } = useApp();
  const [filter, setFilter] = useState<Filter>(instellingen.filter);
  const [storingenOpen, setStoringenOpen] = useState(false);
  const nu = useNu(10_000);

  const poll = usePolling(`halte:${id}:${filter}`, () => api.halte(id, filter, 40), 15_000);
  const h = poll.data;
  const naam = h?.naam || String(p.naam || "Halte");
  const plaats = h?.plaats || String(p.plaats || "");
  const fav = isFavoriet(id);
  const beideModi = !!h && h.modi.includes("train") && h.modi.some((m) => m !== "train");
  const titel = naam;
  const haltegroep = String(p.groep || "").trim();
  const groepSub = [plaats && !naam.toLowerCase().includes(plaats.toLowerCase()) ? plaats : "", haltegroep].filter(Boolean).join(" · ");

  const openRit = (v: Vertrek) => {
    if (!v.rit) return;
    router.push({
      pathname: "/rit",
      params: {
        ...v.rit, van, lijn: v.lijn, bestemming: v.bestemming, vervoerder: v.vervoerder, modus: v.modus,
        instap_halte: id, instap_naam: naam, instap_ms: v.vertrek_ms ? String(v.vertrek_ms) : "",
        richting: v.bestemming
      }
    });
  };

  const storingen = h?.storingen ?? [];

  let lijst: React.ReactNode;
  if (poll.laden && !h) lijst = <Laden />;
  else if (!h && poll.fout)
    lijst = <Leeg icoon="cloud-offline-outline" titel="Kan vertrektijden niet laden" tekst={poll.fout} knop={{ label: "Opnieuw", onPress: () => void poll.verversen() }} />;
  else if (h && !h.vertrekken.length)
    lijst = <Leeg icoon="moon-outline" titel="Geen vertrekken" tekst={filter === "alles" ? "Er vertrekt hier de komende tijd niets." : `Geen ${filter === "trein" ? "treinen" : "bussen"} de komende tijd.`} />;
  else if (h)
    lijst = (
      <Kaart>
        {h.vertrekken.map((v, i) => (
          <VertrekRegel key={`${v.lijn}-${v.vertrek_ms}-${i}`} v={v} nu={nu} onPress={v.rit ? () => openRit(v) : undefined} />
        ))}
      </Kaart>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Kop
        terug
        titel={titel}
        detail={groepSub || undefined}
        sub={h ? `${h.verouderd ? "Verouderd · " : ""}Bijgewerkt ${klok(h.bijgewerkt)}` : "Laden…"}
        rechts={
          <KopKnop
            icoon={fav ? "star" : "star-outline"}
            kleur={fav ? colors.star : undefined}
            label={fav ? "Verwijder uit favorieten" : "Bewaar als favoriet"}
            onPress={() => wisselFavoriet({ id, naam, plaats })}
          />
        }
      />
      {beideModi || filter !== "alles" ? (
        <View style={[s.chips, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Chips<Filter>
            opties={[
              { key: "alles", label: "Alles" },
              { key: "trein", label: "Trein", icoon: "train-outline" },
              { key: "bus", label: "Bus", icoon: "bus-outline" }
            ]}
            waarde={filter}
            onKies={setFilter}
          />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={s.inhoud} refreshControl={<RefreshControl refreshing={false} onRefresh={() => void poll.verversen()} colors={[colors.accent]} />}>
        {storingen.length ? (
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={() => setStoringenOpen((o) => !o)}
              style={[s.storing, { backgroundColor: colors.warnBg, borderColor: colors.warnBorder }]}
              accessibilityRole="button"
              accessibilityHint={storingenOpen ? "Inklappen" : "Toon storingen"}
            >
              <Ionicons name="alert-circle-outline" size={20} color={colors.delay} />
              <Text style={[s.storingText, { color: colors.warnText }]} numberOfLines={storingenOpen ? undefined : 1}>
                {storingen[0].titel}
                {storingen.length > 1 ? ` · +${storingen.length - 1}` : ""}
              </Text>
              <Ionicons name={storingenOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.delay} />
            </Pressable>
            {storingenOpen ? storingen.map((st) => <StoringKaart key={st.id} st={st} />) : null}
          </View>
        ) : null}
        {poll.fout && h ? <FoutBalk tekst={poll.fout} /> : null}
        {lijst}
      </ScrollView>
      <OnderBalk actief={van} />
    </View>
  );
}

const s = StyleSheet.create({
  chips: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth * 2 },
  inhoud: { padding: 12, gap: 12, paddingBottom: 24 },
  storing: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, paddingVertical: 10 },
  storingText: { flex: 1, fontSize: 15, fontWeight: "600" }
});
