"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
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
import { SidebarContent } from "./sidebar-content";

/** Barra superior en pantallas de menos de 1024 px: abre el menú en un Sheet lateral. */
export function MobileTopbar({
  professionalName,
  email,
  botStatus,
  account,
}: {
  professionalName: string | null;
  email?: string | null;
  botStatus: BotShellStatus;
  account: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Abrir menú">
            <Menu aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col p-0">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <SheetDescription className="sr-only">Navegación principal del panel</SheetDescription>
          <div className="flex h-14 shrink-0 items-center border-b px-4">
            <Wordmark subtitle={professionalName} className="min-w-0 flex-1 pr-8" />
          </div>
          <SidebarContent
            email={email}
            botStatus={botStatus}
            account={account}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
      <Wordmark subtitle={professionalName} />
    </header>
  );
}
