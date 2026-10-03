"use client";

import { usePathname } from "next/navigation";
import { SearchX } from "lucide-react";
import { StatusScreen } from "@/components/status-screen";
import { ButtonLink } from "@/components/ui";

/** URLs inexistentes (sin shell). */
export default function RootNotFound() {
  const pathname = usePathname();
  const portal = pathname?.startsWith("/portal") ?? false;

  return (
    <main className={`flex min-h-[100dvh] items-center justify-center px-6 ${portal ? "theme-portal bg-grouped text-foreground" : ""}`}>
      <StatusScreen
        icon={SearchX}
        title="No encontramos esta página"
        description="Puede que el enlace esté mal o que lo que buscabas ya no exista."
        actions={
          portal ? (
            <ButtonLink href="/portal" size="lg">
              Volver al inicio
            </ButtonLink>
          ) : (
            <ButtonLink href="/">Volver al calendario</ButtonLink>
          )
        }
      />
    </main>
  );
}
