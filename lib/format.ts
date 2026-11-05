import type { Palette } from "../constants/theme";
import type { Modus, Vertrek } from "./types";

/** "Nu", "1 min", "12 min", of de kloktijd als het langer dan een uur duurt. */
export function aftellen(ms: number | null, now: number, klok: string): string {
  if (ms == null) return klok || "—";
  const diff = ms - now;
  if (diff <= 30_000) return "Nu";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "1 min";
  if (min >= 60) return klok;
  return `${min} min`;
}

export function afstand(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

export function klokSec(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function klok(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function datumKort(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MAANDEN[d.getMonth()]}`;
}

/** Tekst voor wanneer een storing geldt: "Sinds 06:00 · t/m 12 dec". */
export function periode(vanaf: number | null, tot: number | null, now = Date.now()): string {
  const delen: string[] = [];
  if (vanaf) {
    const zelfdeDag = new Date(vanaf).toDateString() === new Date(now).toDateString();
    delen.push(vanaf <= now ? `Sinds ${zelfdeDag ? klok(new Date(vanaf)) : datumKort(vanaf)}` : `Vanaf ${datumKort(vanaf)} ${klok(new Date(vanaf))}`);
  }
  if (tot) {
    const zelfdeDag = new Date(tot).toDateString() === new Date(now).toDateString();
    delen.push(zelfdeDag ? `tot ${klok(new Date(tot))}` : `t/m ${datumKort(tot)}`);
  }
  return delen.join(" · ");
}

export type Status = { text: string; color: string; dot: boolean };

/** Groen stipje = echte live-data; oranje tekst = vertraging. Vroeg rijden tonen we niet. */
export function status(v: Pick<Vertrek, "vervallen" | "live" | "vertraging_min">, c: Palette): Status {
  if (v.vervallen) return { text: "", color: c.red, dot: false };
  if (v.live && v.vertraging_min > 0) return { text: `+${v.vertraging_min} min`, color: c.delay, dot: true };
  if (v.live) return { text: "Live", color: c.live, dot: true };
  return { text: "Gepland", color: c.sub, dot: false };
}

export function isTrein(m: Modus): boolean {
  return m === "train";
}

export function spoorLabel(modus: Modus, spoor: string): string {
  if (!spoor) return "";
  return isTrein(modus) ? `Spoor ${spoor}` : `Perron ${spoor}`;
}

export function ritNummer(id: string): string {
  const m = /[:/](\d{2,6})$/.exec(id || "");
  return m ? `rit ${m[1]}` : "";
}
