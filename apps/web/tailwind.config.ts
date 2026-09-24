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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
