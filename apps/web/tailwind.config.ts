import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      colors: {
        // Sistema "Spring-inspired": verde hoja + tinta casi negra + fondo salvia.
        ink: {
          DEFAULT: "#14181f",
          soft: "#4a5460",
          faint: "#8a94a0",
        },
        leaf: {
          DEFAULT: "#5aa832",
          bright: "#93cf52",
          deep: "#3c7a24",
          tint: "#e9f2e6",
        },
        mint: "#eef4ec",
        paper: "#ffffff",
        line: "#dbe2d8",
        link: "#2563eb",
        // Alias histórico usado por components/ui.tsx, ahora en verde.
        brand: {
          DEFAULT: "#5aa832",
          dark: "#3c7a24",
        },
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,24,31,0.04), 0 12px 32px -12px rgba(20,24,31,0.12)",
        lift: "0 24px 60px -20px rgba(20,24,31,0.28)",
      },
      keyframes: {
        "float-slow": {
          "0%, 100%": { transform: "translate3d(0,0,0)" },
          "50%": { transform: "translate3d(0,-14px,0)" },
        },
      },
      animation: {
        "float-slow": "float-slow 9s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
