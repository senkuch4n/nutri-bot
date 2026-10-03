import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import plugin from "tailwindcss/plugin";
import {
  colors,
  cssVariablesFor,
  durations,
  easings,
  legacyTypeScale,
  materials,
  moreContrastOverrides,
  newColorTokens,
  overlayAlpha,
  portalColorOverrides,
  radii,
  shadows,
  typeScale,
} from "./src/lib/design-tokens";

// Tokens como variables CSS en canales HSL (convención shadcn/ui para Tailwind v3). Los valores
// salen de src/lib/design-tokens.ts (fuente única, HU-017a); globals.css solo los usa.
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;
const fixed = (name: string, alpha: number) => `hsl(var(--${name}) / ${alpha})`;

// ─── Convivencia (SDD §7.8, fases 2–6) ─────────────────────────────────────────
// `:root` recibe solo los nombres nuevos. Los nombres shadcn conservan los valores Notion de
// globals.css hasta el "flip" (fase 7). La demo (`/dev-diseno*`) marca su raíz con
// `data-apple-preview` y ve el lenguaje completo: el selector `:root:has([data-apple-preview])`
// aplica también los nombres shadcn, radios y escala tipográfica nuevos (alcanza a los overlays
// de Radix porque viven en un portal bajo <body>).
const PREVIEW = ":root:has([data-apple-preview])";

const newColorVars = cssVariablesFor(Object.fromEntries(newColorTokens.map((k) => [k, colors[k]])));

const materialVars = Object.fromEntries(
  Object.entries(materials).flatMap(([name, m]) => [
    [`--material-${name}-alpha`, String(m.alpha)],
    [`--material-${name}-blur`, `${m.blurPx}px`],
    [`--material-${name}-saturate`, `${m.saturate * 100}%`],
  ]),
);

const motionVars = {
  ...Object.fromEntries(Object.entries(durations).map(([k, v]) => [`--duration-${k}`, `${v}ms`])),
  "--ease-out": easings.out,
  "--ease-in-out": easings.inOut,
};

// Radios y escala por defecto detrás de variables: sin la variable definida valen exactamente lo
// de antes (fallback). La demo las define con los valores Apple.
const radiusVars = {
  "--radius-sm": radii.sm,
  "--radius-default": radii.DEFAULT,
  "--radius-md": radii.md,
  "--radius-lg": radii.lg,
  "--radius-xl": radii.xl,
  "--radius-2xl": radii["2xl"],
};
const legacyTypeVars = Object.fromEntries(
  Object.entries(legacyTypeScale).flatMap(([k, s]) => [
    [`--text-${k}`, s.size],
    [`--text-${k}-lh`, s.lineHeight],
    [`--text-${k}-tracking`, s.tracking],
  ]),
);

const tailwindDefaultSizes: Record<keyof typeof legacyTypeScale, [string, string]> = {
  xs: ["0.75rem", "1rem"],
  sm: ["0.875rem", "1.25rem"],
  base: ["1rem", "1.5rem"],
  lg: ["1.125rem", "1.75rem"],
  xl: ["1.25rem", "1.75rem"],
  "2xl": ["1.5rem", "2rem"],
  "3xl": ["1.875rem", "2.25rem"],
  "4xl": ["2.25rem", "2.5rem"],
};
// letter-spacing sin fallback: si la variable no existe la declaración es inválida y se hereda,
// igual que hoy (Tailwind no declara tracking en text-*).
type FontSizeValue = [string, { lineHeight: string; letterSpacing: string; fontWeight?: string }];

const legacyFontSize: Record<string, FontSizeValue> = Object.fromEntries(
  Object.entries(tailwindDefaultSizes).map(([k, [size, lh]]) => [
    k,
    [`var(--text-${k}, ${size})`, { lineHeight: `var(--text-${k}-lh, ${lh})`, letterSpacing: `var(--text-${k}-tracking)` }],
  ]),
);

const semanticFontSize: Record<string, FontSizeValue> = Object.fromEntries(
  Object.entries(typeScale).map(([k, s]) => [
    k,
    [s.size, { lineHeight: s.lineHeight, letterSpacing: s.tracking, fontWeight: String(s.weight) }],
  ]),
);

const designTokens = plugin(({ addBase, addVariant }) => {
  addBase({
    ":root": { ...newColorVars, ...materialVars, ...motionVars },
    ".theme-portal, :root:has(.theme-portal)": cssVariablesFor(portalColorOverrides),
    [PREVIEW]: { ...cssVariablesFor(colors), ...radiusVars, ...legacyTypeVars },
    [`${PREVIEW}:has(.theme-portal)`]: cssVariablesFor(portalColorOverrides),
    [`@media (prefers-contrast: more)`]: { [PREVIEW]: cssVariablesFor(moreContrastOverrides) },
    [`${PREVIEW}:has(.a11y-more-contrast)`]: cssVariablesFor(moreContrastOverrides),
  });

  // Estado presionado (§1): en puntero fino exige :hover además de :active, así arrastrar fuera
  // con el mouse suelta el estado; en táctil alcanza con :active.
  addVariant("pressed", [
    "@media (hover: hover) and (pointer: fine) { &:active:hover }",
    "@media not ((hover: hover) and (pointer: fine)) { &:active }",
  ]);
  // Más contraste: el ajuste del sistema o la simulación de la demo.
  addVariant("more-contrast", ["@media (prefers-contrast: more) { & }", ":root:has(.a11y-more-contrast) &"]);
});

export default {
  darkMode: ["class"], // preparado; ningún código agrega la clase `dark` (D3 de HU-017 → 017f)
  content: ["./src/**/*.{ts,tsx}"],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: { ...legacyFontSize, ...semanticFontSize },
      colors: {
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        background: token("background"),
        foreground: token("foreground"),
        grouped: token("grouped"),
        tertiary: token("tertiary"),
        placeholder: token("placeholder"),
        primary: {
          DEFAULT: token("primary"),
          foreground: token("primary-foreground"),
          hover: token("primary-hover"),
          pressed: token("primary-pressed"),
          soft: token("primary-soft"),
          "soft-hover": token("primary-soft-hover"),
          "soft-pressed": token("primary-soft-pressed"),
          vibrant: token("primary-vibrant"),
        },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        fill: { hover: token("fill-hover"), pressed: token("fill-pressed") },
        muted: {
          DEFAULT: token("muted"),
          foreground: token("muted-foreground"),
          "foreground-vibrant": token("muted-foreground-vibrant"),
        },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        destructive: {
          DEFAULT: token("destructive"),
          foreground: token("destructive-foreground"),
          hover: token("destructive-hover"),
          pressed: token("destructive-pressed"),
          muted: token("destructive-muted"),
          "muted-hover": token("destructive-muted-hover"),
          "muted-pressed": token("destructive-muted-pressed"),
          vibrant: token("destructive-vibrant"),
        },
        success: { DEFAULT: token("success"), muted: token("success-muted") },
        warning: { DEFAULT: token("warning"), muted: token("warning-muted") },
        info: { DEFAULT: token("info"), muted: token("info-muted") },
        link: token("link"),
        sidebar: token("sidebar"),
        overlay: { hover: fixed("overlay", overlayAlpha.hover), pressed: fixed("overlay", overlayAlpha.pressed) },
        scrim: fixed("overlay", overlayAlpha.scrim),
      },
      borderRadius: {
        xs: radii.xs,
        DEFAULT: "var(--radius-default, 0.25rem)",
        sm: "var(--radius-sm, calc(var(--radius) - 4px))",
        md: "var(--radius-md, calc(var(--radius) - 2px))",
        lg: "var(--radius-lg, var(--radius))",
        xl: "var(--radius-xl, 0.75rem)",
        "2xl": "var(--radius-2xl, 1rem)",
      },
      boxShadow: { ...shadows },
      transitionDuration: Object.fromEntries(Object.keys(durations).map((k) => [k, `var(--duration-${k})`])),
      transitionTimingFunction: { "out-soft": "var(--ease-out)", "in-out-soft": "var(--ease-in-out)" },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "rise-in": { from: { opacity: "0", transform: "translateY(0.5rem)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "fade-in": "fade-in var(--duration-fade) var(--ease-out) both",
        "fade-in-content": "fade-in var(--duration-content) var(--ease-out) both",
        "rise-in": "rise-in var(--duration-content) var(--ease-out) both",
      },
    },
  },
  plugins: [animate, designTokens],
} satisfies Config;
