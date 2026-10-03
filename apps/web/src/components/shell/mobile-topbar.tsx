"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { LayoutGroup } from "motion/react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/primitives/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/primitives/sheet";
import type { BotShellStatus } from "@/lib/shell";
import type { NavBadges } from "./nav-config";
import { ScrollEdgeHeader } from "./scroll-edge-header";
import { SidebarContent } from "./sidebar-content";

/**
 * Barra superior en pantallas de menos de 1024 px (HU-017a §10.2): material translúcido con scroll
 * edge; abre el menú en un Sheet lateral que se cierra arrastrando hacia la izquierda.
 * La altura queda en `h-14`: `patient-tabs.tsx` usa `top-14` para su sticky.
 */
export function MobileTopbar({
  professionalName,
  email,
  botStatus,
  account,
  badges,
}: {
  professionalName: string | null;
  email?: string | null;
  botStatus: BotShellStatus;
  account: ReactNode;
  /** HU-011: contadores de la sidebar (se ven dentro del menú, no en la hamburguesa: P8). */
  badges?: NavBadges;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="contents lg:hidden">
      <ScrollEdgeHeader className="sticky top-0 z-30 flex h-14 items-center gap-2 px-2 lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" size="icon-lg" aria-label="Abrir menú">
              <Menu strokeWidth={1.75} aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0">
            <SheetTitle className="sr-only">Menú</SheetTitle>
            <SheetDescription className="sr-only">Navegación principal del panel</SheetDescription>
            <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
              <Wordmark subtitle={professionalName} className="min-w-0 flex-1 pr-10" />
            </div>
            <LayoutGroup id="sidebar-mobile">
              <SidebarContent
                email={email}
                botStatus={botStatus}
                account={account}
                badges={badges}
                density="touch"
                onNavigate={() => setOpen(false)}
              />
            </LayoutGroup>
          </SheetContent>
        </Sheet>
        <Wordmark subtitle={professionalName} />
      </ScrollEdgeHeader>
    </div>
  );
}
