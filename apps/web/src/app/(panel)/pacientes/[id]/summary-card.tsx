"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { patientTabQuery } from "@/lib/patient-tab-route";
import { cn } from "@/lib/utils";
import { usePatientTabs, type PatientTabTarget } from "./patient-tabs";

const surface =
  "relative flex h-full min-h-32 w-full flex-col rounded-xl bg-card p-5 text-left text-card-foreground shadow-card more-contrast:border more-contrast:border-input";
const interactive =
  "press-sm transition-colors duration-hover hover:bg-overlay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function CardBody({ title, icon, children, chevron }: { title: string; icon: ReactNode; children: ReactNode; chevron: boolean }) {
  return (
    <>
      <span className="flex items-center gap-2 text-subheadline font-medium text-muted-foreground">
        <span aria-hidden className="inline-flex shrink-0 [&_svg]:size-4 [&_svg]:stroke-[1.75]">
          {icon}
        </span>
        <span className="min-w-0 flex-1">{title}</span>
        {chevron ? <ChevronRight className="size-4 shrink-0 text-tertiary" strokeWidth={2} aria-hidden /> : null}
      </span>
      <div className="mt-2 flex min-w-0 flex-1 flex-col">{children}</div>
    </>
  );
}

/**
 * Tarjeta del Resumen (HU-017c-2): toda la tarjeta es tocable (press de 017a + chevron) y lleva a su
 * detalle: un enlace (`href`) o una pestaña de la ficha (`tab`). Sin destino es una tarjeta estática
 * (p. ej. "Sin turno"), y puede llevar su propio botón en `footer`.
 */
export function SummaryCard({
  title,
  icon,
  href,
  tab,
  footer,
  children,
}: {
  title: string;
  /** Ícono ya renderizado (`<Scale />`): esta tarjeta es cliente y la arma un server component, y una
   *  función (el componente del ícono) no cruza esa frontera. */
  icon: ReactNode;
  href?: string;
  tab?: PatientTabTarget;
  /** Acción propia de una tarjeta sin destino ("Ver planes", "Cargar peso"). */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { go } = usePatientTabs();
  if (href) {
    return (
      <Link href={href} className={cn(surface, interactive)}>
        <CardBody title={title} icon={icon} chevron>
          {children}
        </CardBody>
      </Link>
    );
  }
  if (tab) {
    // Un <a> a la URL canónica de la pestaña (no un <button>: adentro puede ir un Metric con <p>/<div>).
    // El clic cambia de pestaña en el lugar, sin ir al servidor.
    const query = patientTabQuery(tab.tab, tab.view ?? "medidas").toString();
    return (
      <a
        href={query ? `?${query}` : "?"}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          go(tab);
        }}
        className={cn(surface, interactive)}
      >
        <CardBody title={title} icon={icon} chevron>
          {children}
        </CardBody>
      </a>
    );
  }
  return (
    <section className={surface} aria-label={title}>
      <CardBody title={title} icon={icon} chevron={false}>
        {children}
      </CardBody>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  );
}

/** Línea principal (17 px semibold) y secundaria (gris) de una tarjeta. */
export function SummaryCardText({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <>
      <span className="block text-headline text-foreground">{primary}</span>
      {secondary ? <span className="mt-0.5 block text-callout text-muted-foreground">{secondary}</span> : null}
    </>
  );
}
