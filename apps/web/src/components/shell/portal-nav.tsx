"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, House, NotebookPen, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const items: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/portal", label: "Inicio", icon: House },
  { href: "/portal/plan", label: "Plan", icon: ClipboardList },
  { href: "/portal/evolucion", label: "Evolución", icon: TrendingUp },
  { href: "/portal/diario", label: "Diario", icon: NotebookPen },
];

function isActive(pathname: string, href: string) {
  return href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);
}

/** Navegación del portal: pestañas abajo en el celular (`bottom`) o arriba en pantallas grandes (`top`). */
export function PortalNav({ variant, className }: { variant: "top" | "bottom"; className?: string }) {
  const pathname = usePathname();

  if (variant === "bottom") {
    return (
      <nav
        aria-label="Portal"
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden",
          className,
        )}
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                active
                  ? "font-medium text-foreground before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:rounded-full before:bg-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Portal" className={cn("items-center gap-1", className)}>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
