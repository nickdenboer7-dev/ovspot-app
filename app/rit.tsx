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
import { positieBevestigd, positieTekst } from "../lib/wayfindingV2";
import type { Rit, RitHalte } from "../lib/types";

type Rij = { soort: "halte"; h: RitHalte; i: number } | { soort: "nu" };

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
  const komend = positieBevestigd(rit) ? c.live : c.accent;
  const n = rit.haltes.length;
  const nh = rit.nu_hier;

  const segVoorbij = (j: number) => {
    if (nh) return nh.bij_halte ? j + 1 <= nh.volgende_index : j + 1 <= nh.na_index;
    const hNext = rit.haltes[j + 1];
    return hNext?.state === "PASSED" || hNext?.status === "geweest";
  };

  return {
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
    // INCOMING betreft het voertuig op zijn vorige rit: geen 'Nu hier' op deze route.
    const nh = rit.rit_status === "INCOMING" ? null : rit.nu_hier;
    const bevestigd = positieBevestigd(rit);
    const voortgangLabel = positieTekst(rit);
    const rijen: Rij[] = [];

    const voorbijAantal = rit.haltes.findIndex((h) => (h.state ? h.state !== "PASSED" : h.status !== "geweest"));
    const voorbij = rit.rit_status === "INCOMING" ? 0 : voorbijAantal < 0 ? rit.haltes.length : voorbijAantal;

    // Bij meer dan 2 gepasseerde haltes standaard inklappen tot de laatste gepasseerde halte
    const toonVanaf = voorbij > 2 && !toonGepasseerd ? Math.max(0, voorbij - 1) : 0;

    rit.haltes.forEach((h, i) => {
      if (i < toonVanaf) return;
      rijen.push({ soort: "halte", h, i });
      if (nh && !nh.bij_halte && i === nh.na_index) rijen.push({ soort: "nu" });
    });
    if (nh && !nh.bij_halte && nh.na_index < 0) rijen.unshift({ soort: "nu" });
    const laatste = rit.haltes.length - 1;

    tijdlijn = (
      <Kaart style={{ paddingHorizontal: 13, paddingTop: 5, paddingBottom: 7 }}>
        {voorbij > 2 ? (
          <Pressable
            onPress={() => setToonGepasseerd((v) => !v)}
            accessibilityRole="button"
            style={s.passeerKnop}
          >
            <Text style={[s.passeerText, { color: colors.accent }]}>
              {toonGepasseerd ? "Verberg eerdere haltes" : `Toon ${voorbij - 1} eerdere halte${voorbij - 1 > 1 ? "s" : ""}`}
            </Text>
            <Ionicons name={toonGepasseerd ? "chevron-up" : "chevron-down"} size={18} color={colors.accent} />
          </Pressable>
        ) : null}

        {rijen.map((r, k) => {
          const scheiding = k < rijen.length - 1 ? { borderBottomColor: colors.divider, borderBottomWidth: StyleSheet.hairlineWidth * 2 } : null;

          if (r.soort === "nu") {
            const over = nh?.over_min == null ? "" : nh.over_min <= 0 ? " · nu" : ` over ${nh.over_min} min`;
            return (
              <View
                key="nu"
                style={[s.rij, { minHeight: 72 }, scheiding]}
                onLayout={(e) => scrollNaar(e.nativeEvent.layout.y)}
                accessible
                accessibilityLabel={`${voortgangLabel}. Volgende halte ${nh?.volgende_naam}${over}`}
              >
                <View style={s.tijdKol} />
                <View style={s.rail}>
                  <View style={[s.lijnBoven, { backgroundColor: kl.voorbij }]} />
                  <View style={[s.lijnOnder, { backgroundColor: kl.komend }]} />
                  <View style={[s.nuBol, { backgroundColor: colors.live, borderColor: colors.liveGlow }]}>
                    <Ionicons name={trein ? "train" : "bus"} size={15} color="#fff" />
                  </View>
                </View>
                <View style={s.naamKol}>
                  <Text style={[s.nuTitel, { color: bevestigd ? colors.live : colors.accent }]}>{voortgangLabel}</Text>
                  <Text style={[s.nuSub, { color: colors.sub }]} numberOfLines={2}>
                    Volgende: {nh?.volgende_naam}{over}
                  </Text>
                </View>
              </View>
            );
          }

          const { h, i } = r;
          const geweest = h.state ? h.state === "PASSED" : h.status === "geweest";
          const huidig = h.state ? h.state === "ARRIVED" : h.status === "huidig";
          const naderend = h.state === "APPROACHING";
          const beginhalte = rit.rit_status === "INCOMING" && i === 0;
          const vertraagd = h.vertraging_min > 0;

          const tijdKleur = geweest || h.vervalt ? colors.muted : vertraagd ? colors.delay : rit.live && h.live_tijd ? colors.live : colors.text;
          const sub = vertraagd ? h.gepland : "";
          const wacht = minutenTussen(h.aankomst, h.vertrek);
          const aanVertrek = wacht >= 2 && wacht <= 15 && !geweest ? `aankomst ${h.aankomst} · vertrek ${h.vertrek}` : "";
          const onderregel = h.plaats;

          return (
            <View
              key={`${h.id}-${i}`}
              style={[s.rij, scheiding]}
              onLayout={huidig || naderend ? (e) => scrollNaar(e.nativeEvent.layout.y) : undefined}
              accessible
              accessibilityLabel={`${h.naam}${h.plaats ? `, ${h.plaats}` : ""}, ${h.vervalt ? "vervalt" : h.verwacht}${vertraagd ? `, gepland ${h.gepland}` : ""}${geweest ? ", geweest" : ""}${huidig ? (bevestigd ? ", halteert nu" : ", verwachte positie") : ""}`}
            >
              <View style={s.tijdKol}>
                <Text style={[s.tijd, { color: tijdKleur, textDecorationLine: h.vervalt ? "line-through" : "none" }]}>
                  {h.verwacht || h.gepland}
                </Text>
                {sub ? (
                  <Text style={[s.tijdSub, vertraagd ? { color: colors.muted, textDecorationLine: "line-through" } : { color: colors.live }]}>
                    {sub}
                  </Text>
                ) : null}
              </View>

              <View style={s.rail}>
                <View style={[s.lijnBoven, { backgroundColor: kl.boven(i) }]} />
                <View style={[s.lijnOnder, { backgroundColor: kl.onder(i) }]} />
                {huidig || naderend ? (
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
                    style={[
                      s.naam,
                      { color: geweest || h.vervalt ? colors.muted : colors.text, textDecorationLine: h.vervalt ? "line-through" : "none" },
                      (huidig || naderend || beginhalte) ? { fontWeight: "800", color: huidig || naderend ? colors.live : colors.text } : null
                    ]}
                    numberOfLines={2}
                  >
                    {h.naam}
                  </Text>
                  {beginhalte && !h.vervalt ? <Label tekst="Beginhalte" bg={colors.infoBg} fg={colors.infoText} /> : null}
                  {h.vervalt ? <Label tekst="Vervalt" bg={colors.redBg} fg={colors.red} /> : null}
                  {i === laatste && !h.vervalt ? <Label tekst="Eindhalte" bg={colors.accent} fg={colors.onAccent} /> : null}
                  {h.spoor_gewijzigd ? <Label tekst={`Spoor ${h.spoor_gewijzigd.naar}`} bg={colors.warnBg} fg={colors.delay} /> : null}
                </View>

                {huidig ? (
                  <Text style={[s.nuTitelKlein, { color: bevestigd ? colors.live : colors.accent }]}>
                    {voortgangLabel}
                  </Text>
                ) : null}

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

  const draai = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!poll.laatsteOk) return;
    draai.setValue(0);
    Animated.timing(draai, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [poll.laatsteOk, draai]);

  const isLive = rit?.live_positie ?? rit?.positie_betrouwbaar;
  const isIncoming = rit?.rit_status === "INCOMING" && !rit?.vervallen;
  const inkomendVoertuig = rit?.voertuig_info ?? rit?.voertuig;
  const inkomendNummer = String(inkomendVoertuig?.nummer ?? "").trim();
  const inkomendGpsLeeftijd = inkomendVoertuig?.leeftijd_s;
  const inkomendSoort = trein ? "Trein" : rit?.modus === "tram" ? "Tram" : rit?.modus === "metro" ? "Metro" : "Bus";

  useEffect(() => {
    if (rit?.rit_status !== "INCOMING") return;
    // Een inkomende bus heeft de eerste halte nog niet bereikt.
    gescrold.current = false;
    setToonGepasseerd(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [rit?.rit_status, rit?.id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.kop, { backgroundColor: colors.header, borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} accessibilityRole="button" accessibilityLabel="Terug" style={s.kopKnop} hitSlop={8}>
          <Ionicons name="arrow-back" size={26} color={colors.headerText} />
        </Pressable>
        {lijn ? (
          <View style={[s.lijnVak, { backgroundColor: colors.infoBg, borderColor: colors.infoBg }]}>
            <Text style={[s.lijnVakText, { color: colors.infoText }]} numberOfLines={1}>
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
        <Pressable onPress={() => router.push("/instellingen")} accessibilityRole="button"
          accessibilityLabel="Instellingen" style={s.kopKnop} hitSlop={8}>
          <Ionicons name="settings-outline" size={23} color={colors.headerSub} />
        </Pressable>
      </View>

      {rit ? (
        <View style={s.liveVast}>
          <View style={[s.liveBalk, {
            backgroundColor: isIncoming ? colors.infoBg : colors.surface,
            borderColor: isIncoming ? colors.infoBg : colors.border
          }, isIncoming ? s.incomingBalk : null]}>
            {rit.vervallen ? (
              <Text style={[s.liveText, { color: colors.red }]}>Deze rit vervalt</Text>
            ) : isIncoming ? (
              <View style={s.incomingInhoud}>
                <View style={s.incomingKop}>
                  <LiveStip kleur={colors.infoText} />
                  <Text style={[s.incomingTitel, { color: colors.infoText }]} numberOfLines={2}>
                    {rit.status_omschrijving || "Onderweg naar beginhalte"}
                  </Text>
                </View>
                <View style={s.incomingDetails}>
                  {inkomendNummer ? (
                    <Text style={[s.incomingDetail, { color: colors.text }]} numberOfLines={1}>
                      {inkomendSoort} {inkomendNummer}
                    </Text>
                  ) : null}
                  <Text style={[s.incomingGps, { color: poll.fout ? colors.red : colors.sub }]} numberOfLines={1}>
                    {poll.fout ? "Verbinding kwijt" : typeof inkomendGpsLeeftijd === "number" && inkomendGpsLeeftijd >= 0
                      ? `GPS ${inkomendGpsLeeftijd}s oud` : "Positie geschat"}
                  </Text>
                </View>
              </View>
            ) : rit.live ? (
              <View style={s.liveLinks}>
                <LiveStip kleur={colors.live} />
                <Text style={[s.liveText, { color: colors.live }]}>
                  {rit.rit_status === "ARRIVED" ? "Bij halte" : rit.rit_status === "DRIVING" ? "Rijdt nu" : "Live tijden"}
                </Text>
                {rit.vertraging_min > 0 || isLive ? (
                  <Text style={[s.liveText, { color: rit.vertraging_min > 0 ? colors.delay : colors.live }]}>
                    {rit.vertraging_min > 0 ? `+${rit.vertraging_min} min` : "Op tijd"}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={[s.liveText, { color: colors.sub }]}>Dienstregeling</Text>
            )}
            {!isIncoming ? (
              <>
                <View style={[s.streepje, { backgroundColor: colors.border }]} />
                <View style={s.ververst}>
                  <Animated.View style={{ transform: [{ rotate: draai.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
                    <Ionicons name={poll.fout ? "cloud-offline-outline" : "sync"} size={15} color={poll.fout ? colors.red : colors.sub} />
                  </Animated.View>
                  <Text style={[s.ververstText, { color: poll.fout ? colors.red : colors.sub }]} numberOfLines={1}>
                    {poll.fout ? "Verbinding kwijt" : isLive && rit.nu_hier?.gps_leeftijd_s != null
                      ? `GPS ${rit.nu_hier.gps_leeftijd_s}s oud`
                      : isLive && typeof rit.gps_leeftijd_s === "number" ? `GPS ${rit.gps_leeftijd_s}s oud`
                      : rit.live ? "Positie geschat" : "Geen GPS-positie"}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
      ) : null}

      <ScrollView ref={scrollRef} contentContainerStyle={s.inhoud} refreshControl={<RefreshControl refreshing={false} onRefresh={() => void poll.verversen()} colors={[colors.accent]} />}>
        {/* Bij live KV8-tijden zonder bevestigde GPS volstaat het neutrale label
            "Positie geschat" in de statusbalk. Geen tweede, alarmerende banner. */}
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
  kop: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 14, paddingRight: 12, paddingLeft: 4, borderBottomWidth: 1 },
  kopKnop: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  lijnVak: { minWidth: 48, height: 38, paddingHorizontal: 10, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  lijnVakText: { fontSize: 17, fontWeight: "800" },
  kopTitel: { fontSize: 20, lineHeight: 25, fontWeight: "800", letterSpacing: -0.4 },
  kopSub: { fontSize: 12, marginTop: 3 },
  inhoud: { padding: 14, gap: 13, paddingBottom: 28 },
  infoBalk: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, padding: 13 },
  infoTitel: { fontSize: 14, fontWeight: "800" },
  infoTekst: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  liveBalk: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, minHeight: 48 },
  incomingBalk: { paddingVertical: 9, alignItems: "stretch" },
  incomingInhoud: { flex: 1, gap: 3 },
  incomingKop: { flexDirection: "row", alignItems: "center", gap: 8 },
  incomingTitel: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  incomingDetails: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 19 },
  incomingDetail: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  incomingGps: { fontSize: 12, flexShrink: 1 },
  liveLinks: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveText: { fontSize: 14, fontWeight: "700" },
  streepje: { width: 1, height: 22 },
  ververst: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  ververstText: { fontSize: 13, flexShrink: 1 },
  rij: { flexDirection: "row", alignItems: "stretch", minHeight: 57 },
  tijdKol: { width: 62, justifyContent: "center", paddingLeft: 4 },
  tijd: { fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  tijdSub: { fontSize: 13, fontWeight: "500", marginTop: 1, fontVariant: ["tabular-nums"] },
  rail: { width: 32, alignItems: "center", justifyContent: "center" },
  lijnBoven: { position: "absolute", top: 0, height: "50%", width: 4, left: 14 },
  lijnOnder: { position: "absolute", bottom: 0, height: "50%", width: 4, left: 14 },
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
  label: { paddingHorizontal: 9, minHeight: 23, borderRadius: 8, justifyContent: "center" },
  labelText: { fontSize: 12, fontWeight: "700" }
});
