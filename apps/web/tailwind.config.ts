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

// Variables de color, materiales y movimiento en `:root` (el "flip" de la fase 7, SDD §7.8). El portal
// cambia solo el fondo agrupado (D2). Más contraste sube el separador.
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

type FontSizeValue = [string, { lineHeight: string; letterSpacing: string; fontWeight?: string }];

// Escala por defecto de Tailwind re-mapeada (tracking y leading por tamaño, §7.2), sin peso.
const legacyFontSize: Record<string, FontSizeValue> = Object.fromEntries(
  Object.entries(legacyTypeScale).map(([k, s]) => [k, [s.size, { lineHeight: s.lineHeight, letterSpacing: s.tracking }]]),
);

const semanticFontSize: Record<string, FontSizeValue> = Object.fromEntries(
  Object.entries(typeScale).map(([k, s]) => [
    k,
    [s.size, { lineHeight: s.lineHeight, letterSpacing: s.tracking, fontWeight: String(s.weight) }],
  ]),
);

const designTokens = plugin(({ addBase, addVariant }) => {
  addBase({
    ":root": { ...cssVariablesFor(colors), ...materialVars, ...motionVars },
    ".theme-portal, :root:has(.theme-portal)": cssVariablesFor(portalColorOverrides),
    "@media (prefers-contrast: more)": { ":root": cssVariablesFor(moreContrastOverrides) },
    ":root:has(.a11y-more-contrast)": cssVariablesFor(moreContrastOverrides),
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
      borderRadius: { ...radii },
      // Las sombras por defecto toman la escala nueva (así `shadow-md` de pantallas sin migrar, como el
      // popover propio de food-picker, queda en el nivel 2).
      boxShadow: {
        ...shadows,
        sm: shadows.card,
        DEFAULT: shadows.float,
        md: shadows.float,
        lg: shadows.modal,
        xl: shadows.modal,
      },
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
