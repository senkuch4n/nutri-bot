"use client";

import { useState, useTransition } from "react";
import { Button, cn } from "@/components/ui";
import { Modal } from "@/components/modal";
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

  return (
    <div
      className={cn(
        "flex flex-col border border-line bg-paper shadow-card",
        !service.active && "bg-mint/40",
      )}
    >
      <div className="flex items-stretch gap-3">
        <span
          className="w-1.5 shrink-0"
          style={{ background: service.color }}
          title="Color con el que aparece en el calendario"
        />
        <div className="flex flex-1 flex-col p-5 pl-3.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-lg font-bold leading-tight text-ink">{service.name}</h3>
            {!service.active ? (
              <span className="shrink-0 border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Inactivo
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-sm text-ink-soft">
            <span className="font-semibold text-ink">{priceLabel}</span>
            <span className="mx-1.5 text-ink-faint">·</span>
            {service.durationMin} min
          </p>

          {service.requiresDeposit ? (
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.06em] text-leaf-deep">
              Requiere seña
            </p>
          ) : null}

          {service.prepInstructions ? (
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.06em] text-link">
              Manda recomendaciones previas
            </p>
          ) : null}

          {service.description ? (
            <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-soft">
              {service.description}
            </p>
          ) : null}

          <div className="mt-auto flex items-center gap-1 pt-5">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => toggleServiceAction(service.id, !service.active))}
              className="px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
            >
              {pending
                ? "Guardando…"
                : service.active
                  ? "Desactivar"
                  : "Activar"}
            </button>
          </div>
        </div>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={`Editar · ${service.name}`}>
        <ServiceForm editing={service} onDone={() => setEditing(false)} />
      </Modal>
    </div>
  );
}
