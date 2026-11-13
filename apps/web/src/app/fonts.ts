import { Inter } from "next/font/google";

/** Inter variable con eje de tamaño óptico (`opsz` 14–32) además de `wght` (SDD D-T10). */
export const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  axes: ["opsz"],
});
