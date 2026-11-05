import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isTab, OnderBalk } from "../components/OnderBalk";
import { Kaart, Laden, Leeg, LiveStip } from "../components/ui";
import { useApp } from "../context/AppProvider";
import type { Palette } from "../constants/theme";
import { api } from "../lib/api";
import { isTrein, ritNummer } from "../lib/format";
import { usePolling } from "../lib/hooks";
import type { Rit, RitHalte } from "../lib/types";

type Rij = { soort: "halte"; h: RitHalte; i: number } | { soort: "nu" };

/** Minuten tussen twee "HH:MM"-tijden (over middernacht heen). 0 als een van beide ontbreekt. */
function minutenTussen(a: string, b: string): number {
  const m = (t: string) => {
    const r = /^(\d{1,2}):(\d{2})$/.exec(t || "");
    return r ? Number(r[1]) * 60 + Number(r[2]) : null;
  };
  const x = m(a);
  const y = m(b);
  if (x == null || y == null) return 0;
  return (y - x + 1440) % 1440;
}

function railKleuren(rit: Rit, c: Palette) {
  const voorbij = c.rail;
  const komend = rit.live ? c.live : c.accent;
  const n = rit.haltes.length;
  const nh = rit.nu_hier;
  // Segment j -> j+1 is voorbij als het voertuig al voorbij halte j+1 is (of er staat).
  const segVoorbij = (j: number) => {
    if (nh) return nh.bij_halte ? j + 1 <= nh.volgende_index : j + 1 <= nh.na_index;
    return rit.haltes[j + 1]?.status === "geweest";
  };
  return {
    // Het stuk tussen de laatst gepasseerde halte en de volgende is in tweeën gedeeld door de 'Nu hier'-regel:
    // onderkant van de gepasseerde halte grijs, bovenkant van de volgende halte gekleurd.
    boven: (i: number) => (i === 0 ? "transparent" : segVoorbij(i - 1) ? voorbij : komend),
    onder: (i: number) => (i === n - 1 ? "transparent" : segVoorbij(i) || (!!nh && !nh.bij_halte && i === nh.na_index) ? voorbij : komend),
    voorbij,
    komend
  };
}

export default function Ritverloop() {
  const p = useLocalSearchParams<{
    trip?: string; datum?: string; voertuig?: string; van?: string; lijn?: string; bestemming?: string;
    vervoerder?: string; modus?: string; instap_halte?: string; instap_naam?: string; instap_ms?: string; richting?: string;
  }>();
  const van = isTab(p.van) ? p.van : "index";
  const ref = {
    trip: p.trip ? String(p.trip) : undefined,
    datum: p.datum ? String(p.datum) : undefined,
    voertuig: p.voertuig ? String(p.voertuig) : undefined,
    instap_halte: p.instap_halte ? String(p.instap_halte) : undefined,
    instap_naam: p.instap_naam ? String(p.instap_naam) : undefined,
    instap_ms: p.instap_ms && Number.isFinite(Number(p.instap_ms)) ? Number(p.instap_ms) : undefined,
    richting: p.richting ? String(p.richting) : undefined
  };
  const [toonGepasseerd, setToonGepasseerd] = useState(false);
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const gescrold = useRef(false);

  const poll = usePolling(`rit:${ref.trip}:${ref.datum}:${ref.voertuig}:${ref.instap_halte}:${ref.instap_ms}:${ref.richting}`, () => api.rit(ref), (d) => (d?.live ? 5_000 : 30_000));
  const rit = poll.data;

  const lijn = rit?.lijn || String(p.lijn || "");
  const bestemming = rit?.bestemming || String(p.bestemming || "Rit");
  const vervoerder = rit?.vervoerder || String(p.vervoerder || "");
  const trein = isTrein(rit?.modus || String(p.modus || ""));
  const ritnr = rit ? ritNummer(rit.id) : "";
  const kopSub = [vervoerder, rit?.lijn_naam && rit.lijn_naam !== lijn ? rit.lijn_naam : "", ritnr].filter(Boolean).join(" · ");

  const scrollNaar = (y: number) => {
    if (gescrold.current) return;
    gescrold.current = true;
    if (y > 260) setTimeout(() => scrollRef.current?.scrollTo({ y: y - 160, animated: false }), 50);
  };

  let tijdlijn: React.ReactNode = null;
  if (rit) {
    const kl = railKleuren(rit, colors);
    const nh = rit.nu_hier;
    const rijen: Rij[] = [];
    const voorbijAantal = rit.haltes.findIndex((h) => h.status !== "geweest");
    const voorbij = voorbijAantal < 0 ? rit.haltes.length : voorbijAantal;
    const toonVanaf = voorbij > 4 && !toonGepasseerd ? voorbij - 2 : 0;
    rit.haltes.forEach((h, i) => {
      if (i < toonVanaf) return;
      rijen.push({ soort: "halte", h, i });
      if (nh && !nh.bij_halte && i === nh.na_index) rijen.push({ soort: "nu" });
    });
    if (nh && !nh.bij_halte && nh.na_index < 0) rijen.unshift({ soort: "nu" });
    const laatste = rit.haltes.length - 1;

    tijdlijn = (
      <Kaart style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
        {voorbij > 4 ? (
          <Pressable onPress={() => setToonGepasseerd((v) => !v)}
            accessibilityRole="button" style={s.passeerKnop}>
            <Text style={[s.passeerText, { color: colors.accent }]}>
              {toonGepasseerd ? "Verberg gepasseerde haltes" : `Toon ${voorbij - 2} eerdere haltes`}
            </Text>
            <Ionicons name={toonGepasseerd ? "chevron-up" : "chevron-down"} size={18} color={colors.accent} />
          </Pressable>
        ) : null}
        {rijen.map((r, k) => {
          const scheiding = k < rijen.length - 1 ? { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth * 2 } : null;
          if (r.soort === "nu") {
            const over = nh?.over_min == null ? "" : nh.over_min <= 0 ? " · nu" : ` over ${nh.over_min} min`;
            return (
              <View key="nu" style={[s.rij, { minHeight: 72 }, scheiding]} onLayout={(e) => scrollNaar(e.nativeEvent.layout.y)} accessible accessibilityLabel={`Nu hier. Volgende halte ${nh?.volgende_naam}${over}`}>
                <View style={s.tijdKol} />
                <View style={s.rail}>
                  <View style={[s.lijnBoven, { backgroundColor: kl.voorbij }]} />
                  <View style={[s.lijnOnder, { backgroundColor: kl.komend }]} />
                  <View style={[s.nuBol, { backgroundColor: colors.live, borderColor: colors.liveGlow }]}>
                    <Ionicons name={trein ? "train" : "bus"} size={15} color="#fff" />
                  </View>
                </View>
                <View style={s.naamKol}>
                  <Text style={[s.nuTitel, { color: colors.live }]}>Nu hier</Text>
                  <Text style={[s.nuSub, { color: colors.sub }]} numberOfLines={2}>
                    Volgende: {nh?.volgende_naam}
                    {over}
                  </Text>
                </View>
              </View>
            );
          }
          const { h, i } = r;
          const geweest = h.status === "geweest";
          const huidig = h.status === "huidig";
          const vertraagd = h.vertraging_min > 0;
          const tijdKleur = geweest || h.vervalt ? colors.muted : vertraagd ? colors.delay : rit.live && h.live_tijd ? colors.live : colors.text;
          // Op tijd = groene tijd, geen extra tekst. Bij vertraging de geplande tijd doorgestreept eronder.
          const sub = vertraagd ? h.gepland : "";
          // Aankomst/vertrek alleen als het voertuig er echt even staat (2 min of meer).
          const wacht = minutenTussen(h.aankomst, h.vertrek);
          const aanVertrek = wacht >= 2 && wacht <= 15 && !geweest ? `aankomst ${h.aankomst} · vertrek ${h.vertrek}` : "";
          const onderregel = h.plaats;
          return (
            <View
              key={`${h.id}-${i}`}
              style={[s.rij, scheiding]}
              onLayout={huidig ? (e) => scrollNaar(e.nativeEvent.layout.y) : undefined}
              accessible
              accessibilityLabel={`${h.naam}${h.plaats ? `, ${h.plaats}` : ""}, ${h.vervalt ? "vervalt" : h.verwacht}${vertraagd ? `, gepland ${h.gepland}` : ""}${geweest ? ", geweest" : ""}${huidig ? ", nu hier" : ""}`}
            >
              <View style={s.tijdKol}>
                <Text style={[s.tijd, { color: tijdKleur, textDecorationLine: h.vervalt ? "line-through" : "none" }]}>{h.verwacht || h.gepland}</Text>
                {sub ? (
                  <Text style={[s.tijdSub, vertraagd ? { color: colors.muted, textDecorationLine: "line-through" } : { color: colors.live }]}>{sub}</Text>
                ) : null}
              </View>
              <View style={s.rail}>
                <View style={[s.lijnBoven, { backgroundColor: kl.boven(i) }]} />
                <View style={[s.lijnOnder, { backgroundColor: kl.onder(i) }]} />
                {huidig ? (
                  <View style={[s.nuBol, { backgroundColor: colors.live, borderColor: colors.liveGlow }]}>
                    <Ionicons name={trein ? "train" : "bus"} size={15} color="#fff" />
                  </View>
                ) : geweest ? (
                  <View style={[s.vinkBol, { backgroundColor: colors.rail }]}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  </View>
                ) : (
                  <View style={[s.open, { borderColor: h.vervalt ? colors.rail : kl.komend, backgroundColor: colors.surface }]} />
                )}
              </View>
              <View style={s.naamKol}>
                <View style={s.naamRij}>
                  <Text
                    style={[s.naam, { color: geweest || h.vervalt ? colors.muted : colors.text, textDecorationLine: h.vervalt ? "line-through" : "none" }]}
                    numberOfLines={2}
                  >
                    {h.naam}
                  </Text>
                  {h.vervalt ? <Label tekst="Vervalt" bg={colors.redBg} fg={colors.red} /> : null}
                  {i === laatste && !h.vervalt ? <Label tekst="Eindhalte" bg={colors.accent} fg={colors.onAccent} /> : null}
                  {h.spoor_gewijzigd ? <Label tekst={`Spoor ${h.spoor_gewijzigd.naar}`} bg={colors.warnBg} fg={colors.delay} /> : null}
                </View>
                {huidig ? <Text style={[s.nuTitelKlein, { color: colors.live }]}>Nu hier</Text> : null}
                {onderregel ? (
                  <Text style={[s.plaats, { color: colors.sub }]} numberOfLines={1}>
                    {onderregel}
                  </Text>
                ) : null}
                {aanVertrek ? (
                  <Text style={[s.wacht, { color: colors.sub }]} numberOfLines={1}>
                    {aanVertrek}
                  </Text>
                ) : null}
              </View>
              {h.spoor && trein ? <Text style={[s.spoor, { color: colors.sub }]}>Spoor {h.spoor}</Text> : null}
            </View>
          );
        })}
      </Kaart>
    );
  }

  // Icoontje draait één keer rond bij elke geslaagde verversing.
  const draai = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!poll.laatsteOk) return;
    draai.setValue(0);
    Animated.timing(draai, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [poll.laatsteOk, draai]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.kop, { backgroundColor: colors.header, paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} accessibilityRole="button" accessibilityLabel="Terug" style={s.kopKnop} hitSlop={8}>
          <Ionicons name="arrow-back" size={26} color={colors.headerText} />
        </Pressable>
        {lijn ? (
          <View style={[s.lijnVak, { borderColor: colors.headerText }]}>
            <Text style={[s.lijnVakText, { color: colors.headerText }]} numberOfLines={1}>
              {lijn}
            </Text>
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.kopTitel, { color: colors.headerText }]} numberOfLines={2} accessibilityRole="header">
            {bestemming}
          </Text>
          {kopSub ? (
            <Text style={[s.kopSub, { color: colors.headerSub }]} numberOfLines={1}>
              {kopSub}
            </Text>
          ) : null}
        </View>
      </View>

      {rit ? (
        <View style={s.liveVast}>
          <View style={[s.liveBalk, { backgroundColor: colors.surface2 }]}>
            {rit.vervallen ? (
              <Text style={[s.liveText, { color: colors.red }]}>Deze rit vervalt</Text>
            ) : rit.live ? (
              <View style={s.liveLinks}>
                <LiveStip kleur={colors.live} />
                <Text style={[s.liveText, { color: colors.live }]}>Live</Text>
                <Text style={[s.liveText, { color: rit.vertraging_min > 0 ? colors.delay : colors.live }]}>
                  {rit.vertraging_min > 0 ? `+${rit.vertraging_min} min` : rit.positie_betrouwbaar ? "Op tijd" : "Tijden"}
                </Text>
              </View>
            ) : (
              <Text style={[s.liveText, { color: colors.sub }]}>Dienstregeling</Text>
            )}
            <View style={[s.streepje, { backgroundColor: colors.border }]} />
            <View style={s.ververst}>
              <Animated.View style={{ transform: [{ rotate: draai.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
                <Ionicons name={poll.fout ? "cloud-offline-outline" : "sync"} size={15} color={poll.fout ? colors.red : colors.sub} />
              </Animated.View>
              <Text style={[s.ververstText, { color: poll.fout ? colors.red : colors.sub }]} numberOfLines={1}>
                {poll.fout ? "Verbinding kwijt" : rit.positie_betrouwbaar && rit.nu_hier?.gps_leeftijd_s != null
                  ? `GPS ${rit.nu_hier.gps_leeftijd_s}s oud`
                  : "Positie onbekend"}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <ScrollView ref={scrollRef} contentContainerStyle={s.inhoud} refreshControl={<RefreshControl refreshing={false} onRefresh={() => void poll.verversen()} colors={[colors.accent]} />}>
        {poll.laden && !rit ? <Laden /> : null}
        {!rit && poll.fout && !poll.laden ? (
          <Leeg icoon="git-commit-outline" titel="Rit niet gevonden" tekst={poll.fout} knop={{ label: "Opnieuw", onPress: () => void poll.verversen() }} />
        ) : null}
        {tijdlijn}
      </ScrollView>
      <OnderBalk actief={van} />
    </View>
  );
}

function Label({ tekst, bg, fg }: { tekst: string; bg: string; fg: string }) {
  return (
    <View style={[s.label, { backgroundColor: bg }]}>
      <Text style={[s.labelText, { color: fg }]}>{tekst}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  kop: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 14, paddingRight: 14 },
  kopKnop: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  lijnVak: { minWidth: 46, height: 40, paddingHorizontal: 9, borderWidth: 2, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  lijnVakText: { fontSize: 20, fontWeight: "800" },
  kopTitel: { fontSize: 21, lineHeight: 25, fontWeight: "800", letterSpacing: -0.3 },
  kopSub: { fontSize: 14, marginTop: 1 },
  inhoud: { padding: 10, gap: 12, paddingBottom: 24 },
  liveBalk: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingHorizontal: 14, minHeight: 46 },
  liveLinks: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveText: { fontSize: 16, fontWeight: "700" },
  streepje: { width: 1, height: 22 },
  ververst: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  ververstText: { fontSize: 13, flexShrink: 1 },
  rij: { flexDirection: "row", alignItems: "stretch", minHeight: 57 },
  tijdKol: { width: 62, justifyContent: "center", paddingLeft: 4 },
  tijd: { fontSize: 17, fontWeight: "700" },
  tijdSub: { fontSize: 13, fontWeight: "500", marginTop: 1 },
  rail: { width: 32, alignItems: "center", justifyContent: "center" },
  lijnBoven: { position: "absolute", top: 0, height: "50%", width: 3, left: 14.5 },
  lijnOnder: { position: "absolute", bottom: 0, height: "50%", width: 3, left: 14.5 },
  vinkBol: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  open: { width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
  nuBol: { width: 32, height: 32, borderRadius: 16, borderWidth: 5, alignItems: "center", justifyContent: "center" },
  naamKol: { flex: 1, minWidth: 0, justifyContent: "center", paddingLeft: 10, paddingVertical: 7 },
  naamRij: { flexDirection: "row", alignItems: "center", gap: 8 },
  naam: { fontSize: 17, fontWeight: "700", flexShrink: 1 },
  plaats: { fontSize: 14, marginTop: 2 },
  wacht: { fontSize: 13, marginTop: 1 },
  liveVast: { paddingHorizontal: 10, paddingTop: 10 },
  spoor: { fontSize: 13, alignSelf: "center", paddingLeft: 6 },
  nuTitel: { fontSize: 17, fontWeight: "800" },
  nuTitelKlein: { fontSize: 13, fontWeight: "700", marginTop: 1 },
  nuSub: { fontSize: 13, marginTop: 1 },
  passeerKnop: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  passeerText: { fontSize: 13, fontWeight: "700" },
  label: { paddingHorizontal: 8, height: 22, borderRadius: 6, justifyContent: "center" },
  labelText: { fontSize: 12, fontWeight: "700" }
});
