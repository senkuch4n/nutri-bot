import type { Metadata } from "next";
import { MotionProvider } from "@/components/motion-provider";
import { sans } from "./fonts";
import "./globals.css";

const description = "Turnos y seguimiento nutricional";

// Vista previa de links (WhatsApp, redes): las imágenes de `opengraph-image.png` necesitan URL absoluta.
// En el build de Docker no hay AUTH_URL, así que el dominio de producción es el valor por defecto.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.AUTH_URL ?? "https://numa.arzium.com.ar"),
  title: "Numa",
  description,
  openGraph: { siteName: "Numa", title: "Numa", description, locale: "es_AR", type: "website" },
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
