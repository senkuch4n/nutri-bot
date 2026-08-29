"use client";

import { useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import { ServiceForm, type EditableService } from "./service-form";
import { toggleServiceAction } from "./actions";

export function ServiceRow({ service, priceLabel }: { service: EditableService; priceLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full" style={{ background: service.color }} />
          <div>
            <div className="font-medium">
              {service.name}{" "}
              {!service.active ? <Badge tone="slate">inactivo</Badge> : null}
            </div>
            <div className="text-sm text-slate-500">
              {priceLabel} · {service.durationMin} min
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              startTransition(() => toggleServiceAction(service.id, !service.active))
            }
            disabled={pending}
          >
            {service.active ? "Desactivar" : "Activar"}
          </Button>
          <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cerrar" : "Editar"}
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <ServiceForm editing={service} onDone={() => setEditing(false)} />
        </div>
      ) : null}
    </div>
  );
}
