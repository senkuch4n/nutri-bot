"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, CheckCircle2 } from "lucide-react";
import { m } from "motion/react";
import { compareToTarget, formatTargetStatus, type Macros, type TargetStatus } from "@nutri-bot/core";
import { MacroTotals } from "@/components/macro-totals";
import { Alert, Quantity } from "@/components/ui";
import { chartPalette } from "@/lib/design-tokens";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Objetivo del plan tal como lo muestra el editor (SDD 7.2). */
export interface PlanTargetView {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** "Objetivo: consulta del 12/09/2026" */
  sourceLabel: string;
}

const integer = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** La pista de la barra llega al 110 % del objetivo, así la marca del 100 % queda a la vista. */
const TRACK_MAX = 1.1;

const CELLS = [
  { key: "kcal", label: "Energía", unit: "kcal", color: chartPalette.macro.kcal },
  { key: "protein", label: "Proteínas", unit: "g", color: chartPalette.macro.protein },
  { key: "carbs", label: "Carbohidratos", unit: "g", color: chartPalette.macro.carbs },
  { key: "fat", label: "Grasas", unit: "g", color: chartPalette.macro.fat },
] as const;

function StatusLine({ status, unit }: { status: TargetStatus; unit: "kcal" | "g" }) {
  const text = formatTargetStatus(status, unit);
  if (status.kind === "ON_TARGET") {
    return (
      <p className="flex items-center gap-1 text-footnote font-semibold text-success">
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
        {text}
      </p>
    );
  }
  const Icon = status.kind === "OVER" ? ArrowUp : ArrowDown;
  return (
    <p
      className={cn(
        "flex items-center gap-1 text-footnote font-semibold",
        status.kind === "OVER" ? "text-warning" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

function TargetCell({
  label,
  value,
  target,
  unit,
  color,
}: {
  label: string;
  value: number;
  target: number;
  unit: "kcal" | "g";
  color: string;
}) {
  const status = compareToTarget(value, target);
  // La barra se llena hasta el objetivo; el exceso no se dibuja (lo dice el texto).
  const fill = target > 0 ? Math.min(value, target) / (target * TRACK_MAX) : 0;
  const valueText = `${integer.format(value)} de ${integer.format(target)} ${unit}${
    status ? `, ${formatTargetStatus(status, unit).toLocaleLowerCase("es-AR")}` : ""
  }`;
  return (
    <div className="min-w-0 bg-card px-3 py-3 sm:px-4">
      <p className="text-subheadline text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-headline tabular-nums sm:text-metric-md">{integer.format(value)}</span>
        <span className="text-footnote tabular-nums text-muted-foreground">
          de {integer.format(target)} {unit}
        </span>
      </p>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.round(value)}
        aria-valuetext={valueText}
        className="relative mt-2 h-2 rounded-full bg-secondary"
      >
        <m.div
          className="absolute inset-y-0 left-0 w-full rounded-full"
          style={{ backgroundColor: color, originX: 0 }}
          initial={false}
          animate={{ scaleX: fill }}
          transition={springs.standard}
        />
        {/* Marca del objetivo (100 %). */}
        <span
          aria-hidden
          className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground"
          style={{ left: `${100 / TRACK_MAX}%` }}
        />
      </div>
      <div className="mt-1.5 min-h-4">{status ? <StatusLine status={status} unit={unit} /> : null}</div>
    </div>
  );
}

/**
 * HU-018b (SDD 7.3): franja del día. Con objetivo, 4 celdas grandes con "lleva de objetivo", barra con
 * marca en el 100 % y el estado en texto (no solo color). Sin objetivo en un plan: los totales de
 * siempre y el aviso para calcular el requerimiento. En plantillas: totales y promedio semanal.
 */
export function DayTargetStrip({
  title,
  totals,
  target,
  targetMissingHref,
  weeklyAverageKcal,
  className,
}: {
  /** "Martes", "Total del día" o "Promedio diario de la semana". */
  title: string;
  totals: Macros;
  target: PlanTargetView | null;
  /** Solo planes sin objetivo: link de "Calculá el requerimiento…". */
  targetMissingHref: string | null;
  /** Promedio semanal de kcal (solo planes semanales con días cargados). */
  weeklyAverageKcal: number | null;
  className?: string;
}) {
  const average =
    weeklyAverageKcal !== null ? `Promedio semanal: ${integer.format(weeklyAverageKcal)} kcal` : null;

  if (!target) {
    return (
      <section aria-label={title} className={cn("space-y-2", className)}>
        <h2 className="text-headline">{title}</h2>
        <MacroTotals totals={totals} label={title} />
        {average ? <p className="text-footnote tabular-nums text-muted-foreground">{average}</p> : null}
        {targetMissingHref ? (
          <Alert tone="info">
            <p>
              Calculá el requerimiento para ver cuánto falta.{" "}
              <Link
                href={targetMissingHref}
                className="touch-target relative font-semibold text-link underline underline-offset-2 hover:text-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Ir a la consulta
              </Link>
            </p>
          </Alert>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-label={title} className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-headline">{title}</h2>
        <p className="text-footnote tabular-nums text-muted-foreground">
          Fibra <Quantity value={totals.fiber} unit="g" decimals={1} />
        </p>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
        {CELLS.map((cell) => (
          <TargetCell
            key={cell.key}
            label={cell.label}
            value={totals[cell.key]}
            target={target[cell.key]}
            unit={cell.unit}
            color={cell.color}
          />
        ))}
      </div>
      <p className="text-footnote tabular-nums text-muted-foreground">
        {[target.sourceLabel, average].filter(Boolean).join(" · ")}
      </p>
    </section>
  );
}
