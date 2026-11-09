import { positieBevestigd } from "./wayfindingV2";
import type { Rit, RitHalte } from "./types";

/** Bestaat uitsluitend als het voertuig betrouwbaar tussen TWEE opeenvolgende haltes is gekoppeld. */
export type RitTraject = { vorigeIndex: number; volgendeIndex: number; van: string; naar: string };

export function bepaalRitTraject(rit: Rit): RitTraject | null {
  const nh = rit.nu_hier;
  if (!rit.live || rit.vervallen || !nh || nh.bij_halte ||
      rit.rit_status === "INCOMING" || rit.rit_status === "ARRIVED" ||
      (rit.rit_status && rit.rit_status !== "DRIVING") || !positieBevestigd(rit)) {
    return null;
  }
  const gpsLeeftijd = nh.gps_leeftijd_s ?? rit.gps_leeftijd_s ??
    rit.voertuig_info?.leeftijd_s ?? rit.voertuig?.leeftijd_s;
  if (typeof gpsLeeftijd === "number" &&
      (!Number.isFinite(gpsLeeftijd) || gpsLeeftijd < 0 || gpsLeeftijd > 120)) return null;

  const vorigeIndex = nh.na_index;
  const volgendeIndex = nh.volgende_index;
  if (!Number.isInteger(vorigeIndex) || !Number.isInteger(volgendeIndex) ||
      vorigeIndex < 0 || volgendeIndex !== vorigeIndex + 1 ||
      volgendeIndex >= rit.haltes.length) return null;

  const vorige = rit.haltes[vorigeIndex];
  const volgende = rit.haltes[volgendeIndex];
  if (!vorige || !volgende || vorige.vervalt || volgende.vervalt ||
      vorige.state === "SCHEDULED" || vorige.status === "komt" ||
      volgende.state === "PASSED" || volgende.status === "geweest") return null;
  const van = String(vorige.naam || "").trim();
  const naar = String(volgende.naam || "").trim();
  if (!van || !naar || van === naar) return null;
  return { vorigeIndex, volgendeIndex, van, naar };
}

export type TussenHalteVoortgang = {
  vorigeIndex: number;
  volgendeIndex: number;
  voortgang: number;
  volgendeMs: number;
  resterendMin: number;
};

/** De GPS-bron bevestigt tussen welke twee haltes het voertuig rijdt.
 * De fractie over de getekende verbindingslijn is uitsluitend TIJD-interpolatie,
 * nooit een exacte GPS-projectie. Zonder bevestigde bron geen voertuigicoon.
 */
export function berekenTussenHalteVoortgang(
  rit: Rit,
  nu = Date.now()
): TussenHalteVoortgang | null {
  const nh = rit.nu_hier;
  if (!rit.live || rit.vervallen || !nh || nh.bij_halte ||
    rit.rit_status === "INCOMING" || !positieBevestigd(rit)) return null;

  const gpsLeeftijd = nh.gps_leeftijd_s ?? rit.gps_leeftijd_s ??
    rit.voertuig_info?.leeftijd_s ?? rit.voertuig?.leeftijd_s;
  if (typeof gpsLeeftijd === "number" &&
    (!Number.isFinite(gpsLeeftijd) || gpsLeeftijd > 120 || gpsLeeftijd < 0)) return null;

  const vorigeIndex = nh.na_index;
  const volgendeIndex = nh.volgende_index;
  if (!Number.isInteger(vorigeIndex) || !Number.isInteger(volgendeIndex) ||
    vorigeIndex < 0 || volgendeIndex !== vorigeIndex + 1 ||
    volgendeIndex >= rit.haltes.length) return null;
  const vorige = rit.haltes[vorigeIndex];
  const volgende = rit.haltes[volgendeIndex];
  if (!vorige || !volgende || vorige.vervalt || volgende.vervalt ||
    vorige.state === "SCHEDULED" || vorige.status === "komt" ||
    volgende.state === "PASSED" || volgende.status === "geweest") return null;

  const [begin, einde] = tijdvenster(vorige, volgende, rit.datum);
  if (!Number.isFinite(begin) || !Number.isFinite(einde) ||
    einde - begin < 15_000 || einde - begin > 2 * 60 * 60 * 1000 ||
    nu < begin - 5 * 60_000 || nu > einde + 5 * 60_000) return null;
  const voortgang = Math.max(0.05, Math.min(0.95, (nu - begin) / (einde - begin)));
  const resterendMin = typeof nh.over_min === "number" && Number.isFinite(nh.over_min)
    ? Math.max(0, Math.round(nh.over_min))
    : Math.max(0, Math.ceil((einde - nu) / 60_000));

  return { vorigeIndex, volgendeIndex, voortgang, volgendeMs: einde, resterendMin };
}

function klokOpDatum(datum: string, klok: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(klok || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum || "") || !match) return NaN;
  const uur = Number(match[1]);
  const minuut = Number(match[2]);
  if (uur > 29 || minuut > 59) return NaN;
  const basis = new Date(datum + "T00:00:00").getTime();
  return Number.isFinite(basis) ? basis + (uur * 60 + minuut) * 60_000 : NaN;
}

function tijdvenster(vorige: RitHalte, volgende: RitHalte, datum: string): [number, number] {
  const prev = vorige.tijd_ms;
  const next = volgende.tijd_ms;
  // Backend timestamps are epoch milliseconds and include realtime adjustments.
  if (typeof prev === "number" && Number.isFinite(prev) && prev > 1e12 &&
    typeof next === "number" && Number.isFinite(next) && next > 1e12 && next > prev) {
    return [prev, next];
  }
  const begin = klokOpDatum(datum, vorige.vertrek || vorige.verwacht || vorige.gepland);
  let einde = klokOpDatum(datum, volgende.aankomst || volgende.verwacht || volgende.gepland);
  // A service can run past midnight. GTFS may provide 24+:xx times.
  if (Number.isFinite(begin) && Number.isFinite(einde) && einde <= begin) {
    einde += 24 * 60 * 60 * 1000;
  }
  return [begin, einde];
}
