"use client";

import { Inter } from "next/font/google";
import { CircleAlert } from "lucide-react";
import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui";
import "./globals.css";

// global-error reemplaza al layout raíz, así que carga la misma fuente para que --font-sans exista.
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/** Errores del layout raíz o de los layouts de grupo, que `error.tsx` no atrapa. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es" className={sans.variable}>
      <body>
        <main className="flex min-h-screen items-center justify-center px-6">
          <StatusScreen
            icon={CircleAlert}
            title="Algo salió mal"
            description="No pudimos mostrar esta pantalla. Probá de nuevo y, si sigue fallando, recargá la página."
            actions={<Button onClick={reset}>Reintentar</Button>}
            detail={error.digest ? `Código: ${error.digest}` : undefined}
          />
        </main>
      </body>
    </html>
  );
}
