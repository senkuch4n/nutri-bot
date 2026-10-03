// Fuente única de los tokens de diseño (HU-017a, SDD §7). Sin imports y sin alias `@/`: lo importan
// `tailwind.config.ts` (por ruta relativa), `lib/chart-theme.ts` y los tests de vitest.
// Los hex viven solo acá; `globals.css` usa las variables que genera `cssVariablesFor`.

// ─── Color (§7.1, modo claro) ──────────────────────────────────────────────────

export const colors = {
  background: "#FFFFFF",
  grouped: "#F5F5F7",
  sidebar: "#F5F5F7",

  foreground: "#1D1D1F",
  "card-foreground": "#1D1D1F",
  "popover-foreground": "#1D1D1F",
  "secondary-foreground": "#1D1D1F",
  "accent-foreground": "#1D1D1F",
  "muted-foreground": "#636366",
  "muted-foreground-vibrant": "#48484A",
  tertiary: "#8E8E93",
  placeholder: "#6E6E73",

  border: "#E5E5EA",
  input: "#86868A",

  secondary: "#EDEDF0",
  "fill-hover": "#E5E5EA",
  "fill-pressed": "#D8D8DD",
  muted: "#F5F5F7",
  accent: "#EDEDF0",
  card: "#FFFFFF",
  popover: "#FFFFFF",

  primary: "#0066CC",
  ring: "#0066CC",
  link: "#0066CC",
  "primary-foreground": "#FFFFFF",
  "primary-hover": "#005BB8",
  "primary-pressed": "#004F9E",
  "primary-soft": "#E8F1FC",
  "primary-soft-hover": "#DDEAFA",
  "primary-soft-pressed": "#D0E2F7",
  "primary-vibrant": "#004F9E",

  destructive: "#D70015",
  "destructive-foreground": "#FFFFFF",
  "destructive-hover": "#C20013",
  "destructive-pressed": "#A80010",
  "destructive-muted": "#FDECEE",
  "destructive-muted-hover": "#FBDFE2",
  "destructive-muted-pressed": "#F8D0D5",
  /** Rojo sobre materiales (vibrancy): `#D70015` da 3,35:1 sobre el peor fondo de un material. */
  "destructive-vibrant": "#A80010",

  success: "#1E7A34",
  "success-muted": "#E8F5EC",
  warning: "#A05A00",
  "warning-muted": "#FFF4E0",
  info: "#0058B0",
  "info-muted": "#EAF2FB",

  /** Base de overlay-hover (4 %), overlay-pressed (8 %) y scrim (30 %). En 017f pasa a blanco. */
  overlay: "#000000",
} as const satisfies Record<string, `#${string}`>;

export type ColorToken = keyof typeof colors;

/** Tokens que no existían en el sistema HU-002 (conviven con los nombres shadcn hasta el "flip", §7.8). */
export const newColorTokens = [
  "grouped",
  "muted-foreground-vibrant",
  "tertiary",
  "placeholder",
  "fill-hover",
  "fill-pressed",
  "primary-hover",
  "primary-pressed",
  "primary-soft",
  "primary-soft-hover",
  "primary-soft-pressed",
  "primary-vibrant",
  "destructive-hover",
  "destructive-pressed",
  "destructive-muted-hover",
  "destructive-muted-pressed",
  "destructive-vibrant",
  "overlay",
] as const satisfies readonly ColorToken[];

/** Fondo agrupado cálido del portal (D2). */
export const portalColorOverrides: Partial<Record<ColorToken, `#${string}`>> = { grouped: "#FBFAF7" };

/** `prefers-contrast: more`: el separador sube a un gris visible. */
export const moreContrastOverrides: Partial<Record<ColorToken, `#${string}`>> = { border: "#C7C7CC" };

/** Opacidades de la capa `overlay` (§7.1). */
export const overlayAlpha = { hover: 0.04, pressed: 0.08, scrim: 0.3 } as const;

// ─── Materiales (§7.5) ─────────────────────────────────────────────────────────

export const materials = {
  chrome: { alpha: 0.8, blurPx: 20, saturate: 1.8 },
  bar: { alpha: 0.85, blurPx: 24, saturate: 1.8 },
  float: { alpha: 0.85, blurPx: 24, saturate: 1.8 },
} as const;

/** Únicos textos permitidos sobre un material (vibrancy, §12). */
export const MATERIAL_TEXT_TOKENS: readonly ColorToken[] = [
  "foreground",
  "muted-foreground-vibrant",
  "primary-vibrant",
  "destructive-vibrant",
];

// ─── Tipografía (§7.2) ─────────────────────────────────────────────────────────

type TypeStyle = { size: string; lineHeight: string; tracking: string; weight?: number };

export const typeScale = {
  "large-title": { size: "2.125rem", lineHeight: "2.5625rem", tracking: "-0.022em", weight: 700 },
  "title-1": { size: "1.75rem", lineHeight: "2.125rem", tracking: "-0.021em", weight: 700 },
  "title-2": { size: "1.375rem", lineHeight: "1.75rem", tracking: "-0.018em", weight: 600 },
  "title-3": { size: "1.25rem", lineHeight: "1.5625rem", tracking: "-0.017em", weight: 600 },
  headline: { size: "1.0625rem", lineHeight: "1.375rem", tracking: "-0.013em", weight: 600 },
  body: { size: "0.9375rem", lineHeight: "1.375rem", tracking: "-0.009em", weight: 400 },
  "body-lg": { size: "1.0625rem", lineHeight: "1.5rem", tracking: "-0.013em", weight: 400 },
  callout: { size: "0.875rem", lineHeight: "1.25rem", tracking: "-0.006em", weight: 400 },
  subheadline: { size: "0.8125rem", lineHeight: "1.125rem", tracking: "-0.003em", weight: 400 },
  footnote: { size: "0.75rem", lineHeight: "1rem", tracking: "0em", weight: 400 },
  caption: { size: "0.6875rem", lineHeight: "0.8125rem", tracking: "0.005em", weight: 500 },
  metric: { size: "2.125rem", lineHeight: "2.5rem", tracking: "-0.022em", weight: 600 },
  "metric-md": { size: "1.75rem", lineHeight: "2.125rem", tracking: "-0.021em", weight: 600 },
} as const satisfies Record<string, TypeStyle>;

export type TypeToken = keyof typeof typeScale;

/** Re-mapeo de la escala por defecto de Tailwind (se aplica en el "flip", §7.8). Sin peso. */
export const legacyTypeScale = {
  xs: { size: "0.75rem", lineHeight: "1rem", tracking: "0em" },
  sm: { size: "0.875rem", lineHeight: "1.25rem", tracking: "-0.006em" },
  base: { size: "1rem", lineHeight: "1.5rem", tracking: "-0.011em" },
  lg: { size: "1.125rem", lineHeight: "1.5rem", tracking: "-0.014em" },
  xl: { size: "1.25rem", lineHeight: "1.5625rem", tracking: "-0.017em" },
  "2xl": { size: "1.5rem", lineHeight: "1.875rem", tracking: "-0.019em" },
  "3xl": { size: "1.875rem", lineHeight: "2.25rem", tracking: "-0.021em" },
  "4xl": { size: "2.25rem", lineHeight: "2.625rem", tracking: "-0.022em" },
} as const satisfies Record<"xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl", Omit<TypeStyle, "weight">>;

// ─── Forma y elevación (§7.3, §7.4) ────────────────────────────────────────────

export const radii = {
  xs: "0.375rem",
  sm: "0.375rem",
  DEFAULT: "0.375rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
  "2xl": "1.375rem",
  full: "9999px",
} as const;

export const shadows = {
  card: "0 0 0 0.5px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)",
  float: "0 0 0 0.5px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.12)",
  modal: "0 0 0 0.5px rgb(0 0 0 / 0.08), 0 24px 64px rgb(0 0 0 / 0.18)",
  thumb: "0 3px 8px rgb(0 0 0 / 0.12), 0 3px 1px rgb(0 0 0 / 0.04), 0 0 0 0.5px rgb(0 0 0 / 0.04)",
  focus: "0 0 0 3px hsl(var(--ring) / 0.25)",
} as const satisfies Record<"card" | "float" | "modal" | "thumb" | "focus", string>;

// ─── Movimiento (§7.6) ─────────────────────────────────────────────────────────

export const durations = { press: 100, release: 200, hover: 150, fade: 150, scrim: 200, content: 200 } as const;

export const easings = {
  out: "cubic-bezier(0.25, 1, 0.5, 1)",
  inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

// ─── Gráficos (§12.2) — todos ≥ 3:1 sobre blanco ──────────────────────────────

export const chartPalette = {
  series: ["#0066CC", "#248A3D", "#C93400", "#8944AB", "#D70015"],
  study: ["#8E8E93", "#636366", "#3A3A3C"],
  metric: {
    weightKg: "#0066CC",
    bodyFatPercent: "#C93400",
    muscleMassKg: "#248A3D",
    bodyWaterPercent: "#007D99",
    visceralFatLevel: "#D70015",
    boneMassKg: "#636366",
    basalMetabolicRateKcal: "#3A3A3C",
  },
  tissue: { adipose: "#C93400", muscle: "#248A3D", bone: "#636366", residual: "#8944AB" },
} as const satisfies {
  series: readonly [string, string, string, string, string];
  study: readonly [string, string, string];
  metric: Record<string, string>;
  tissue: Record<string, string>;
};

// ─── Requisitos de contraste (los recorre design-tokens.test.ts y la demo) ────

const W = "background" as const;
const G = "grouped" as const;
const PW = "#FBFAF7" as const; // agrupado del portal
const F = "secondary" as const; // fill

type ContrastRequirement = { fg: ColorToken; bg: ColorToken | `#${string}`; min: 3 | 4.5; use: string };

function on(fg: ColorToken, bgs: ReadonlyArray<ColorToken | `#${string}`>, min: 3 | 4.5, use: string): ContrastRequirement[] {
  return bgs.map((bg) => ({ fg, bg, min, use }));
}

export const contrastRequirements: ReadonlyArray<ContrastRequirement> = [
  ...on("foreground", [W, G, PW, F, "fill-hover", "fill-pressed", "primary-soft"], 4.5, "Texto principal"),
  ...on("muted-foreground", [W, G, PW, F], 4.5, "Texto secundario"),
  // Ítem de sidebar presionado: agrupado + 8 % de negro.
  { fg: "muted-foreground", bg: "#E1E1E3", min: 4.5, use: "Texto secundario sobre ítem presionado" },
  ...on("placeholder", [W], 4.5, "Placeholder"),
  ...on("primary", [W, G, PW, F, "primary-soft", "primary-soft-hover"], 4.5, "Links, tinted, selección"),
  ...on("primary-foreground", ["primary", "primary-hover", "primary-pressed"], 4.5, "Texto del botón filled"),
  ...on("primary-vibrant", ["primary-soft-pressed"], 4.5, "Tinted presionado"),
  ...on("destructive", [W, G, "destructive-muted"], 4.5, "Error y destructivo"),
  ...on("destructive-foreground", ["destructive", "destructive-hover", "destructive-pressed"], 4.5, "Rojo lleno"),
  ...on("destructive-pressed", ["destructive-muted-pressed"], 4.5, "Destructive-tinted presionado"),
  ...on("success", [W, "success-muted"], 4.5, "Estado OK"),
  ...on("warning", [W, "warning-muted"], 4.5, "Aviso"),
  ...on("info", [W, "info-muted"], 4.5, "Información"),
  ...on("input", [W, G, PW, F], 3, "Borde de control (1.4.11)"),
  ...on("ring", [W, G, "primary-soft"], 3, "Foco"),
];

// ─── Conversión a variables CSS ────────────────────────────────────────────────

function round1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "#0066CC" → "210 100% 40%" (canales HSL para `hsl(var(--x) / <alpha>)`). */
export function hexToHslChannels(hex: string): string {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
  }
  return `${round1(hue)} ${round1(sat * 100)}% ${round1(l * 100)}%`;
}

/** `{ primary: "#0066CC" }` → `{ "--primary": "210 100% 40%" }`. */
export function cssVariablesFor(palette: Partial<Record<ColorToken, string>>): Record<`--${string}`, string> {
  const out: Record<`--${string}`, string> = {};
  for (const [name, hex] of Object.entries(palette)) {
    if (hex) out[`--${name}`] = hexToHslChannels(hex);
  }
  return out;
}
