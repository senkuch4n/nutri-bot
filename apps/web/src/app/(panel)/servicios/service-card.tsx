"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Label } from "@/components/primitives/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/primitives/sheet";
import { Switch } from "@/components/primitives/switch";
import { serviceRemindersSummary } from "@nutri-bot/core";
import { Badge, Button, Card, cn } from "@/components/ui";
import { ServiceForm, type EditableService } from "./service-form";
import { toggleServiceAction } from "./actions";

export function ServiceCard({
  service,
  priceLabel,
}: {
  service: EditableService;
  priceLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const switchId = `activo-${service.id}`;

  return (
    <Card className={cn("flex flex-col", !service.active && "bg-muted/40")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: service.color }}
            title="Color en el calendario"
          >
            <span className="sr-only">Color en el calendario</span>
          </span>
          <h3 className="truncate text-base font-semibold">{service.name}</h3>
        </div>
        {!service.active ? <Badge tone="neutral">Inactivo</Badge> : null}
      </div>

      <p className="mt-2 text-sm tabular-nums">
        <span className="font-medium">{priceLabel}</span>
        <span className="mx-1.5 text-muted-foreground">·</span>
        {service.durationMin} min
      </p>

      {/* Siempre hay al menos un badge: el resumen de recordatorios (HU-014). */}
      <div className="mt-3 flex flex-wrap gap-2">
        {service.requiresDeposit ? <Badge tone="neutral">Requiere seña</Badge> : null}
        {service.prepInstructions ? <Badge tone="info">Manda recomendaciones previas</Badge> : null}
        {service.asksReason ? <Badge tone="neutral">Pide motivo</Badge> : null}
        <Badge tone="neutral">{serviceRemindersSummary(service.reminders)}</Badge>
      </div>

      {service.description ? (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{service.description}</p>
      ) : null}

      <div className="mt-auto flex items-center justify-between pt-5">
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <Pencil aria-hidden />
          Editar
        </Button>
        <div className="flex items-center gap-2">
          <Label htmlFor={switchId} className="text-sm text-muted-foreground">
            Activo
          </Label>
          <Switch
            id={switchId}
            checked={service.active}
            disabled={pending}
            aria-busy={pending || undefined}
            // `checked` es `!service.active` al tocarlo: misma llamada que antes.
            onCheckedChange={(checked) => start(async () => { await toggleServiceAction(service.id, checked); })}
          />
        </div>
      </div>

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{`Editar · ${service.name}`}</SheetTitle>
            <SheetDescription>Los cambios se ven en el bot y en el calendario.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <ServiceForm editing={service} onDone={() => setEditing(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
