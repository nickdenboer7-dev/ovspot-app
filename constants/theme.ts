export type Palette = {
  header: string;
  headerText: string;
  headerSub: string;
  accent: string;
  onAccent: string;
  background: string;
  surface: string;
  surface2: string;
  text: string;
  body: string;
  sub: string;
  muted: string;
  border: string;
  divider: string;
  live: string;
  liveGlow: string;
  delay: string;
  red: string;
  redBg: string;
  busBadge: string;
  trainBadge: string;
  badgeText: string;
  warnBg: string;
  warnBorder: string;
  warnText: string;
  infoBg: string;
  infoText: string;
  rail: string;
  star: string;
  tabInactive: string;
};

export const light: Palette = {
  header: "#FFFFFF",
  headerText: "#0F172A",
  headerSub: "#64748B",
  accent: "#0284C7",
  onAccent: "#FFFFFF",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surface2: "#F1F5F9",
  text: "#0F172A",
  body: "#334155",
  sub: "#64748B",
  muted: "#94A3B8",
  border: "#E2E8F0",
  divider: "#F1F5F9",
  live: "#15803D",
  liveGlow: "#DCFCE7",
  delay: "#B45309",
  red: "#B91C1C",
  redBg: "#FEF2F2",
  busBadge: "#0284C7",
  trainBadge: "#0F2942",
  badgeText: "#FFFFFF",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  warnText: "#92400E",
  infoBg: "#E0F2FE",
  infoText: "#0369A1",
  rail: "#CBD5E1",
  star: "#F59E0B",
  tabInactive: "#94A3B8"
};

export const dark: Palette = {
  header: "#0F172A",
  headerText: "#F8FAFC",
  headerSub: "#94A3B8",
  accent: "#38BDF8",
  onAccent: "#082F49",
  background: "#0B1220",
  surface: "#151F2F",
  surface2: "#1E293B",
  text: "#F8FAFC",
  body: "#CBD5E1",
  sub: "#94A3B8",
  muted: "#64748B",
  border: "#334155",
  divider: "#273449",
  live: "#4ADE80",
  liveGlow: "#163B2A",
  delay: "#FBBF24",
  red: "#FCA5A5",
  redBg: "#451A1A",
  busBadge: "#38BDF8",
  trainBadge: "#334155",
  badgeText: "#FFFFFF",
  warnBg: "#3B2F13",
  warnBorder: "#704F1E",
  warnText: "#FDE68A",
  infoBg: "#102F47",
  infoText: "#7DD3FC",
  rail: "#475569",
  star: "#FBBF24",
  tabInactive: "#94A3B8"
};

/** Opt-in WCAG-oriented high-contrast palettes; no native module required. */
export const highContrastLight: Palette = {
  ...light,
  header: "#FFFFFF", headerText: "#000000", headerSub: "#27364B",
  background: "#FFFFFF", surface: "#FFFFFF", surface2: "#F1F5F9",
  text: "#000000", body: "#17212F", sub: "#27364B", muted: "#334155",
  border: "#526176", divider: "#64748B",
  accent: "#005A9C", onAccent: "#FFFFFF",
  live: "#006B3B", delay: "#8A4300", red: "#A10F1A",
  infoBg: "#E6F1FF", infoText: "#003D75",
  warnBg: "#FFF1D4", warnText: "#623600",
  rail: "#64748B", tabInactive: "#334155",
  busBadge: "#005A9C", trainBadge: "#142E45", badgeText: "#FFFFFF"
};

export const highContrastDark: Palette = {
  ...dark,
  header: "#000000", headerText: "#FFFFFF", headerSub: "#E2E8F0",
  background: "#000000", surface: "#0D1117", surface2: "#19212C",
  text: "#FFFFFF", body: "#F1F5F9", sub: "#E2E8F0", muted: "#CBD5E1",
  border: "#94A3B8", divider: "#94A3B8",
  accent: "#7DD3FC", onAccent: "#00131C",
  live: "#86EFAC", delay: "#FCD34D", red: "#FDA4AF",
  infoBg: "#0D2A43", infoText: "#BAE6FD",
  warnBg: "#32260A", warnText: "#FEF08A",
  rail: "#94A3B8", tabInactive: "#E2E8F0",
  busBadge: "#075985", trainBadge: "#1E3A5F", badgeText: "#FFFFFF"
};
