"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LayoutGroup, m } from "motion/react";
import { Pencil } from "lucide-react";
import { SERVICE_TEXT } from "@nutri-bot/core";
import { Label } from "@/components/primitives/label";
import { Switch } from "@/components/primitives/switch";
import { Button, Card, cn } from "@/components/ui";
import { springs } from "@/lib/motion";
import { notify } from "@/lib/notify";
import { ServiceSheet, type EditableService } from "./service-form";
import { toggleServiceAction } from "./actions";

const T = SERVICE_TEXT;

/** Lo que manda la página por cada servicio (solo datos planos, T9a). */
export interface ServiceView {
  service: EditableService;
  /** formatPrice(price, currency) */
  priceLabel: string;
  /** serviceSummaryLine(…) */
  summary: string;
}

function switchId(id: string): string {
  return `ofrece-${id}`;
}

/**
 * "Activos (N)" y "Pausados (N)" (HU-017b-2). El switch "Lo ofrece el bot" cambia el servicio al
 * instante (como hoy) y la tarjeta se desliza a la otra sección (layout de Motion; con movimiento
 * reducido, sin desplazamiento). Pausar muestra "Deshacer" (8 s), que llama a la misma action con
 * `true`. El foco sigue al switch en su lugar nuevo.
 */
export function ServiceSections({ services, currency }: { services: readonly ServiceView[]; currency: string }) {
  // Valor optimista por servicio hasta que llega la página revalidada.
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());

  useEffect(() => {
    // La página nueva ya trae el valor: se suelta el optimista que coincide.
    setOverrides((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      for (const { service } of services) {
        if (next.get(service.id) === service.active) next.delete(service.id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [services]);

  const isActive = (s: EditableService) => overrides.get(s.id) ?? s.active;
  const setActive = (id: string, value: boolean | null) =>
    setOverrides((prev) => {
      const next = new Map(prev);
      if (value === null) next.delete(id);
      else next.set(id, value);
      return next;
    });

  // El switch se vuelve a montar en la otra sección: se le devuelve el foco si lo tenía.
  const keepFocus = (id: string) => {
    if (document.activeElement?.id !== switchId(id)) return;
    requestAnimationFrame(() => document.getElementById(switchId(id))?.focus());
  };

  async function toggle(view: ServiceView, next: boolean) {
    const { id } = view.service;
    keepFocus(id);
    setActive(id, next);
    const result = await toggleServiceAction(id, next);
    if (!result.ok) {
      setActive(id, null);
      notify.error(result.error);
      return;
    }
    if (next) {
      notify.saved(T.resumed);
      return;
    }
    notify.undo(T.pausedToast, async () => {
      setActive(id, true);
      const undo = await toggleServiceAction(id, true);
      if (!undo.ok) {
        setActive(id, false);
        notify.error(undo.error);
        return;
      }
      notify.saved(T.pausedUndone);
    });
  }

  const active = services.filter((v) => isActive(v.service));
  const paused = services.filter((v) => !isActive(v.service));

  return (
    <LayoutGroup>
      <div className="space-y-8">
        <Section title={T.active(active.length)} empty="Ningún servicio activo: el bot no ofrece turnos.">
          {active.map((v) => (
            <ServiceCard key={v.service.id} view={v} active currency={currency} onToggle={(n) => void toggle(v, n)} />
          ))}
        </Section>
        {paused.length > 0 ? (
          <Section title={T.paused(paused.length)}>
            {paused.map((v) => (
              <ServiceCard key={v.service.id} view={v} active={false} currency={currency} onToggle={(n) => void toggle(v, n)} />
            ))}
          </Section>
        ) : null}
      </div>
    </LayoutGroup>
  );
}

function Section({ title, empty, children }: { title: string; empty?: string; children: ReactNode[] }) {
  return (
    <section>
      <m.h2 layout="position" className="mb-3 text-headline text-foreground">
        {title}
      </m.h2>
      {children.length === 0 && empty ? (
        <p className="text-callout text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

function ServiceCard({
  view,
  active,
  currency,
  onToggle,
}: {
  view: ServiceView;
  active: boolean;
  currency: string;
  onToggle: (next: boolean) => void;
}) {
  const { service, priceLabel, summary } = view;
  const [editing, setEditing] = useState(false);
  const id = switchId(service.id);

  return (
    <m.div layoutId={`servicio-${service.id}`} layout transition={springs.standard} className="h-full">
      <Card className={cn("flex h-full flex-col", !active && "bg-muted/40")}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: service.color }} aria-hidden />
          <h3 className="truncate text-headline" title={service.name}>
            {service.name}
          </h3>
        </div>

        <p className="mt-2 flex items-baseline justify-between gap-3 tabular-nums">
          <span className="text-title-3 text-foreground">{priceLabel}</span>
          <span className="text-callout text-muted-foreground">{`${service.durationMin} min`}</span>
        </p>

        <p className="mt-2 text-footnote text-muted-foreground">{summary}</p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
          <Button variant="secondary" onClick={() => setEditing(true)} aria-label={`${T.edit} ${service.name}`}>
            <Pencil aria-hidden />
            {T.edit}
          </Button>
          <div className="flex min-h-11 items-center gap-3">
            <Label htmlFor={id} className="text-callout text-muted-foreground">
              {T.offeredByBot}
            </Label>
            <Switch id={id} checked={active} onCheckedChange={onToggle} aria-label={`${T.offeredByBot}: ${service.name}`} />
          </div>
        </div>
      </Card>

      <ServiceSheet
        open={editing}
        onOpenChange={setEditing}
        editing={service}
        currency={currency}
        title={`${T.edit} · ${service.name}`}
        description={
          active ? "Los cambios se ven en el bot y en el calendario." : "Está pausado: guardar no lo vuelve a ofrecer."
        }
      />
    </m.div>
  );
}
