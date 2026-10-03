"use client";

import Link from "next/link";
import { ClipboardList, House, NotebookPen, TrendingUp, type LucideIcon } from "lucide-react";
import { LayoutGroup, m } from "motion/react";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useOptimisticPath } from "./use-optimistic-path";

const items: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/portal", label: "Inicio", icon: House },
  { href: "/portal/plan", label: "Plan", icon: ClipboardList },
  { href: "/portal/evolucion", label: "Evolución", icon: TrendingUp },
  { href: "/portal/diario", label: "Diario", icon: NotebookPen },
];

function isActive(pathname: string, href: string) {
  return href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
}

/**
 * Navegación del portal (HU-017a §10.3): tab bar con material abajo en el celular (`bottom`) o
 * pestañas arriba en pantallas grandes (`top`). El activo se marca al instante del clic (optimista)
 * y se distingue por color, peso y trazo del ícono, no solo por color. `activeHref` fija el activo
 * (solo la demo de diseño).
 */
export function PortalNav({
  variant,
  className,
  activeHref,
}: {
  variant: "top" | "bottom";
  className?: string;
  activeHref?: string;
}) {
  const { pathname, markPending } = useOptimisticPath();
  const current = activeHref ?? pathname;

  if (variant === "bottom") {
    return (
      <nav
        aria-label="Portal"
        className={cn(
          "material-bar fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 pb-[env(safe-area-inset-bottom)] md:hidden",
          className,
        )}
      >
        {items.map((item) => {
          const active = isActive(current, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => markPending(item.href, e)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 text-caption press [--press-scale:0.94] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                // Sobre material: variantes vibrant (≥ 5:1 con cualquier contenido debajo).
                active ? "font-semibold text-primary-vibrant" : "font-medium text-muted-foreground",
              )}
            >
              <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <LayoutGroup id="portal-top">
      <nav aria-label="Portal" className={cn("items-center gap-1", className)}>
        {items.map((item) => {
          const active = isActive(current, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => markPending(item.href, e)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative isolate inline-flex h-11 items-center rounded-lg px-3 text-callout font-medium press-sm transition-colors duration-hover hover:bg-overlay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active ? "font-semibold text-primary-vibrant" : "text-foreground",
              )}
            >
              {active ? (
                <m.span
                  layoutId="portal-top-active"
                  aria-hidden
                  transition={springs.indicator}
                  className="absolute inset-0 -z-10 rounded-lg bg-primary-soft"
                />
              ) : null}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
