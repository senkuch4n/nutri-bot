import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui";
import { PortalNav } from "./portal-nav";
import { ScrollEdgeHeader } from "./scroll-edge-header";

/**
 * Header del portal (HU-017a §10.3): material translúcido con scroll edge y safe area. Lo usan el
 * layout del portal y la demo de diseño (`activeHref`). "Salir" mantiene el mismo POST.
 */
export function PortalHeader({ professionalName, activeHref }: { professionalName: string | null; activeHref?: string }) {
  return (
    <ScrollEdgeHeader className="sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-4 px-4">
        <Wordmark subtitle={professionalName} />
        <div className="flex items-center gap-2">
          <PortalNav variant="top" className="hidden md:flex" activeHref={activeHref} />
          <form action="/portal/logout" method="POST">
            <Button type="submit" variant="ghost" size="lg" className="text-muted-foreground">
              <LogOut aria-hidden />
              Salir
            </Button>
          </form>
        </div>
      </div>
    </ScrollEdgeHeader>
  );
}
