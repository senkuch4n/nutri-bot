import { Wordmark } from "@/components/brand";
import { PortalNav } from "./portal-nav";
import { ScrollEdgeHeader } from "./scroll-edge-header";

/**
 * Header del portal (HU-017a §10.3): material translúcido con scroll edge y safe area. Lo usan el
 * layout del portal y la demo de diseño (`activeHref`). HU-017d-1 (D9): sin "Salir"; pasa al final del
 * inicio como "Salir del portal".
 */
export function PortalHeader({ professionalName, activeHref }: { professionalName: string | null; activeHref?: string }) {
  return (
    <ScrollEdgeHeader className="sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-4 px-4">
        <Wordmark subtitle={professionalName} />
        <PortalNav variant="top" className="hidden md:flex" activeHref={activeHref} />
      </div>
    </ScrollEdgeHeader>
  );
}
