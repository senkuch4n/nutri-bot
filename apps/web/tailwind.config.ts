import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Tokens como variables CSS en canales HSL (convención shadcn/ui para Tailwind v3).
// Los valores viven en src/app/globals.css.
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["class"], // preparado; ningún código agrega la clase `dark` (D4)
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // LEGACY (HU-002d la elimina): alias a la sans; Space Grotesk ya no existe.
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        background: token("background"),
        foreground: token("foreground"),
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        destructive: {
          DEFAULT: token("destructive"),
          foreground: token("destructive-foreground"),
          muted: token("destructive-muted"),
        },
        success: { DEFAULT: token("success"), muted: token("success-muted") },
        warning: { DEFAULT: token("warning"), muted: token("warning-muted") },
        info: { DEFAULT: token("info"), muted: token("info-muted") },
        link: token("link"),
        sidebar: token("sidebar"),

        // ── LEGACY: compatibilidad con el sistema "Spring" mientras 002b/c/d migran.
        // HU-002d borra este bloque cuando `grep` no encuentre más usos.
        ink: { DEFAULT: token("foreground"), soft: token("muted-foreground"), faint: token("muted-foreground") },
        leaf: { DEFAULT: token("primary"), bright: token("primary"), deep: token("primary"), tint: token("accent") },
        mint: token("muted"),
        paper: token("card"),
        line: token("border"),
        brand: { DEFAULT: token("primary"), dark: token("primary") },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        card: "var(--radius)", // LEGACY
      },
      boxShadow: {
        card: "none", // LEGACY: el sistema nuevo no usa sombra en tarjetas
        lift: "0 10px 30px -10px hsl(var(--foreground) / 0.18)", // LEGACY
      },
    },
  },
  plugins: [animate],
} satisfies Config;
