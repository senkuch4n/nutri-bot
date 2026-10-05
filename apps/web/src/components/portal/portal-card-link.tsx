import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/** HU-017d-1 (PO3): tarjeta entera tocable. Un único <Link>, press de tarjeta (escala 0,985) y tono
 *  al apretar, flecha a la derecha. `label` = nombre accesible ("Tu plan: Plan de octubre"). Server-safe. */
export function PortalCardLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="group relative flex items-center gap-4 rounded-xl bg-card p-5 shadow-card more-contrast:border more-contrast:border-input press-sm pressed:bg-overlay-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronRight className="size-5 shrink-0 text-tertiary" aria-hidden />
    </Link>
  );
}
