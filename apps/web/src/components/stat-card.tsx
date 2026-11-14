import Link from "next/link";
import { cn } from "@/lib/utils";

const countFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** Tarjeta gris suave de las pantallas de lista (Turnos, Pacientes): etiqueta chica arriba y número
 *  grande abajo. Con `href` la tarjeta entera es un link. */
export function StatCard({
  label,
  value,
  caption,
  primary = false,
  href,
  linkLabel,
}: {
  label: string;
  value: number;
  caption?: string;
  /** La tarjeta principal: la etiqueta va en el color del texto, no en gris. */
  primary?: boolean;
  href?: string;
  /** Nombre accesible del link (si no, se lee la etiqueta y el número). */
  linkLabel?: string;
}) {
  const body = (
    <>
      <p className={cn("text-subheadline", primary ? "text-foreground" : "text-muted-foreground")}>{label}</p>
      <p className="mt-1 text-metric-md font-medium tabular-nums">{countFormat.format(value)}</p>
      {caption ? <p className="mt-0.5 text-footnote text-muted-foreground">{caption}</p> : null}
    </>
  );
  const className =
    "block rounded-xl bg-muted px-5 py-4 sm:px-6 sm:py-5 more-contrast:border more-contrast:border-input";
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link
      href={href}
      aria-label={linkLabel}
      className={cn(
        className,
        "press-none transition-colors duration-hover hover:bg-overlay-hover pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {body}
    </Link>
  );
}
