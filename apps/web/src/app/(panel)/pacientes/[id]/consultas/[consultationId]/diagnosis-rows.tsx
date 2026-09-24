import type { ReactNode } from "react";
import type {
  BmiClass,
  DiagnosisRow,
  HealthyRangeClass,
  MuscleBoneClass,
  WaistHipRisk,
  WaistRisk,
} from "@nutri-bot/core";
import { Badge, Quantity } from "@/components/ui";

// Filas del "Diagnóstico antropométrico" (HU-004), compartidas con la página del estudio ISAK
// (HU-006, sección "Índices de salud"): una sola implementación de filas, etiquetas y tonos.
// Server-safe (sin "use client").

export type Tone = "success" | "warning" | "danger";

// Tonos por clave (core no sabe de tonos). La clasificación siempre va en texto: el color no es
// la única señal.
export const BMI_TONES: Record<BmiClass, Tone> = {
  UNDERWEIGHT: "warning",
  NORMAL: "success",
  OVERWEIGHT: "warning",
  OBESITY_I: "danger",
  OBESITY_II: "danger",
  OBESITY_III: "danger",
};
export const WAIST_TONES: Record<WaistRisk, Tone> = { NO_RISK: "success", ELEVATED: "warning", VERY_ELEVATED: "danger" };
export const WAIST_HIP_TONES: Record<WaistHipRisk, Tone> = { NO_RISK: "success", INCREASED: "warning" };
export const HEALTHY_TONES: Record<HealthyRangeClass, Tone> = { HEALTHY: "success", OUT_OF_RANGE: "warning" };

/** Índice músculo/óseo (HU-006): "Muy bajo" y "Bajo" en warning; el resto neutral. */
export const MUSCLE_BONE_TONES: Record<MuscleBoneClass, "warning" | "neutral"> = {
  VERY_LOW: "warning",
  LOW: "warning",
  MEDIUM: "neutral",
  HIGH: "neutral",
  VERY_HIGH: "neutral",
};

export function fixedDecimals(value: number, decimals: number): string {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
    value,
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right">{children}</dd>
    </div>
  );
}

export function IndicatorRow<K extends string>({
  label,
  row,
  tones,
  unit,
  decimals,
  reference,
  source,
}: {
  label: string;
  row: DiagnosisRow<K>;
  tones: Record<K, Tone>;
  unit?: string;
  decimals: number;
  reference?: string | null;
  source: string | null;
}) {
  if (row.status === "missing") {
    return (
      <Row label={label}>
        <Muted>{row.note}</Muted>
      </Row>
    );
  }
  return (
    <Row label={label}>
      {unit ? (
        <Quantity value={row.value} unit={unit} decimals={decimals} />
      ) : (
        // Índices sin unidad con decimales fijos: "25,0", "0,80" (lo mismo que se clasifica).
        <span className="tabular-nums">{fixedDecimals(row.value, decimals)}</span>
      )}
      {source ? <Muted>{source}</Muted> : null}
      {row.status === "classified" ? (
        <>
          <Badge tone={tones[row.classKey]}>{row.classLabel}</Badge>
          {reference ? <Muted>{reference}</Muted> : null}
        </>
      ) : row.note ? (
        <Muted>{row.note}</Muted>
      ) : null}
    </Row>
  );
}
