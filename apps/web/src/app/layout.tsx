import type { Metadata } from "next";
import { MotionProvider } from "@/components/motion-provider";
import { sans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "NutriBot — Panel",
  description: "Gestión de turnos y servicios",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={sans.variable}>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
