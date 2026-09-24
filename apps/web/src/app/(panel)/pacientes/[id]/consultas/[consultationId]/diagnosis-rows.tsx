import type { ReactNode } from "react";
import { growthZText } from "@nutri-bot/core";
import type {
  BmiClass,
  BmiForAgeClass,
  DiagnosisRow,
  GrowthRow,
  HeightForAgeClass,
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

/** HU-008: IMC para la edad y talla para la edad (OMS 2007). */
export const BMI_FOR_AGE_TONES: Record<BmiForAgeClass, Tone> = {
  SEVERE_THINNESS: "danger",
  THINNESS: "warning",
  NORMAL: "success",
  OVERWEIGHT: "warning",
  OBESITY: "danger",
};
export const HEIGHT_FOR_AGE_TONES: Record<HeightForAgeClass, Tone> = {
  SEVERELY_STUNTED: "danger",
  STUNTED: "warning",
  ADEQUATE: "success",
};

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

/**
 * HU-008: fila de un indicador pediátrico (OMS 2007). Mismo orden que IndicatorRow: valor, fecha de
 * origen, "Z ±x,xx · Pnn", Badge con la clasificación (en texto, no solo color) y la referencia.
 * Implausible: la Z y el aviso en tono warning, sin Badge.
 */
export function GrowthIndicatorRow<K extends string>({
  label,
  row,
  tones,
  unit,
  decimals,
  reference,
  source,
}: {
  label: string;
  row: GrowthRow<K>;
  tones: Record<K, Tone>;
  unit?: string;
  decimals: number;
  reference: string;
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
        <span className="tabular-nums">{fixedDecimals(row.value, decimals)}</span>
      )}
      {source ? <Muted>{source}</Muted> : null}
      {row.status === "classified" ? (
        <>
          <span className="text-xs tabular-nums text-muted-foreground">{growthZText(row.z, row.percentileText)}</span>
          <Badge tone={tones[row.classKey]}>{row.classLabel}</Badge>
          <Muted>{reference}</Muted>
        </>
      ) : row.status === "implausible" ? (
        <>
          <span className="text-xs tabular-nums text-muted-foreground">{growthZText(row.z, "")}</span>
          <span className="text-xs font-medium text-warning">{row.note}</span>
        </>
      ) : (
        <Muted>{row.note}</Muted>
      )}
    </Row>
  );
}
