"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

const links = [
  { href: "/", label: "Calendario" },
  { href: "/servicios", label: "Servicios" },
  { href: "/disponibilidad", label: "Disponibilidad" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/alimentos", label: "Alimentos" },
  { href: "/plantillas", label: "Plantillas" },
  { href: "/pagos", label: "Pagos" },
  { href: "/avisos", label: "Avisos" },
  { href: "/ajustes", label: "Ajustes" },
] as const;

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1">
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "relative px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "text-ink" : "text-ink-soft hover:text-ink",
            )}
          >
            {l.label}
            {active ? (
              <span className="absolute inset-x-3 bottom-0 h-[3px] bg-leaf" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
