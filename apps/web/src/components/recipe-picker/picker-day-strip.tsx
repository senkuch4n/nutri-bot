"use client";

import { ArrowDown, ArrowUp, CheckCircle2 } from "lucide-react";
import { m } from "motion/react";
import { compareToTarget, formatTargetStatus, noTargetStripText, type Macros, type TargetStatus } from "@nutri-bot/core";
import type { PlanTargetView } from "@/components/weekly-menu/day-target-strip";
import { chartPalette } from "@/lib/design-tokens";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";

const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** Igual que DayTargetStrip: la pista llega al 110 % para que la marca del objetivo se vea. */
const TRACK_MAX = 1.1;

const CELLS = [
  { key: "kcal", label: "Energía", unit: "kcal", color: chartPalette.macro.kcal },
  { key: "protein", label: "Proteínas", unit: "g", color: chartPalette.macro.protein },
  { key: "carbs", label: "Carbohidratos", unit: "g", color: chartPalette.macro.carbs },
  { key: "fat", label: "Grasas", unit: "g", color: chartPalette.macro.fat },
] as const;

function StatusIcon({ status }: { status: TargetStatus }) {
  if (status.kind === "ON_TARGET") return <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />;
  return status.kind === "OVER" ? <ArrowUp className="size-3.5 shrink-0" aria-hidden /> : <ArrowDown className="size-3.5 shrink-0" aria-hidden />;
}

function Cell({
  label,
  unit,
  color,
  value,
  preview,
  target,
}: {
  label: string;
  unit: "kcal" | "g";
  color: string;
  value: number;
  /** Valor después de agregar la receta que se está mirando (vista previa), o null. */
  preview: number | null;
  target: number;
}) {
  const shown = preview ?? value;
  const status = compareToTarget(shown, target);
  const fill = (v: number) => (target > 0 ? Math.min(v, target) / (target * TRACK_MAX) : 0);
  const statusText = status ? formatTargetStatus(status, unit) : null;
  const valueText = `${preview !== null ? `${integer.format(value)} → ` : ""}${integer.format(shown)} de ${integer.format(target)} ${unit}${
    statusText ? `, ${statusText.toLocaleLowerCase("es-AR")}` : ""
  }`;
  return (
    <div className="min-w-0 bg-card px-3 py-2">
      <p className="text-footnote text-muted-foreground">{label}</p>
      <p className="flex flex-wrap items-baseline gap-x-1 text-callout font-semibold tabular-nums">
        {preview !== null ? (
          <>
            <span className="font-normal text-muted-foreground">{integer.format(value)}</span>
            <span aria-hidden className="font-normal text-muted-foreground">→</span>
          </>
        ) : null}
        <span>{integer.format(shown)}</span>
        <span className="text-footnote font-normal text-muted-foreground">
          de {integer.format(target)} {unit}
        </span>
      </p>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={valueText}
        className="relative mt-1.5 h-1 rounded-full bg-secondary"
      >
        {/* Tramo que agregaría la receta: el mismo color con 40 % de opacidad. */}
        <m.div
          className="absolute inset-y-0 left-0 w-full rounded-full opacity-40"
          style={{ backgroundColor: color, originX: 0 }}
          initial={false}
          animate={{ scaleX: fill(shown) }}
          transition={springs.standard}
        />
        <m.div
          className="absolute inset-y-0 left-0 w-full rounded-full"
          style={{ backgroundColor: color, originX: 0 }}
          initial={false}
          animate={{ scaleX: fill(value) }}
          transition={springs.standard}
        />
        <span aria-hidden className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground" style={{ left: `${100 / TRACK_MAX}%` }} />
      </div>
      {status && statusText ? (
        <p
          className={cn(
            "mt-1 hidden items-center gap-1 text-footnote font-semibold sm:flex",
            status.kind === "ON_TARGET" ? "text-success" : status.kind === "OVER" ? "text-warning" : "text-muted-foreground",
          )}
        >
          <StatusIcon status={status} />
          {statusText}
        </p>
      ) : null}
    </div>
  );
}

/**
 * HU-018c (SDD 7.3.2): franja compacta del día dentro del buscador (el plan queda detrás del panel
 * modal, así que se repite acá). Con una tarjeta bajo el puntero o con el foco, cada valor muestra
 * "antes → después". Sin objetivo, una línea con los totales.
 */
export function PickerDayStrip({
  title,
  totals,
  preview,
  target,
}: {
  /** "Martes", "Promedio diario de la semana" o "Total del día". */
  title: string;
  totals: Macros;
  preview: Macros | null;
  target: PlanTargetView | null;
}) {
  if (!target) {
    return (
      <p className="text-footnote tabular-nums text-muted-foreground" aria-live="polite">
        {noTargetStripText(title, preview ?? totals)}
      </p>
    );
  }
  return (
    <section aria-label={title}>
      <h3 className="mb-1.5 text-subheadline font-semibold">{title}</h3>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
        {CELLS.map((cell) => (
          <Cell
            key={cell.key}
            label={cell.label}
            unit={cell.unit}
            color={cell.color}
            value={totals[cell.key]}
            preview={preview ? preview[cell.key] : null}
            target={target[cell.key]}
          />
        ))}
      </div>
    </section>
  );
}
