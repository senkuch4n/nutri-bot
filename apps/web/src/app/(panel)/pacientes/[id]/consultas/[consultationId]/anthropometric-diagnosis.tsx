import type { ReactNode } from "react";
import {
  BMI_HEALTHY_RANGE_TEXT,
  DIAGNOSIS_TEXT,
  MINOR_WARNING_TEXT,
  formatDecimalEs,
  type AnthropometricDiagnosis,
  type BmiClass,
  type DiagnosisRow,
  type HealthyRangeClass,
  type WaistHipRisk,
  type WaistRisk,
} from "@nutri-bot/core";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/primitives/table";
import { Alert, Badge, Card, Quantity } from "@/components/ui";

type Tone = "success" | "warning" | "danger";

// Tonos por clave (core no sabe de tonos). La clasificación siempre va en texto: el color no es
// la única señal.
const BMI_TONES: Record<BmiClass, Tone> = {
  UNDERWEIGHT: "warning",
  NORMAL: "success",
  OVERWEIGHT: "warning",
  OBESITY_I: "danger",
  OBESITY_II: "danger",
  OBESITY_III: "danger",
};
const WAIST_TONES: Record<WaistRisk, Tone> = { NO_RISK: "success", ELEVATED: "warning", VERY_ELEVATED: "danger" };
const WAIST_HIP_TONES: Record<WaistHipRisk, Tone> = { NO_RISK: "success", INCREASED: "warning" };
const HEALTHY_TONES: Record<HealthyRangeClass, Tone> = { HEALTHY: "success", OUT_OF_RANGE: "warning" };

export type DiagnosisSourceKey = "weightKg" | "heightCm" | "waistCm" | "hipCm";

/**
 * "Diagnóstico antropométrico" (HU-004, épica 19). Server component, solo lectura: se calcula en
 * cada render con las mediciones D4 y no se guarda.
 */
export function AnthropometricDiagnosisCard({
  diagnosis,
  consultationDateLabel,
  otherDates,
  measuredBodyFat,
}: {
  diagnosis: AnthropometricDiagnosis;
  consultationDateLabel: string;
  /** Fecha "dd/MM/yyyy" de cada dato que viene de otra consulta (ausente si es de esta). */
  otherDates: Partial<Record<DiagnosisSourceKey, string>>;
  /** % de grasa medido (D4), para mostrarlo al lado del estimado. */
  measuredBodyFat: { percent: number; dateLabel: string } | null;
}) {
  const anyFromOther = Object.keys(otherDates).length > 0;
  const description = anyFromOther
    ? "Algunos datos son de mediciones anteriores: se indica la fecha al lado."
    : `Con la medición del ${consultationDateLabel}`;

  const datesOf = (...keys: DiagnosisSourceKey[]): string | null => {
    const dates = [...new Set(keys.map((k) => otherDates[k]).filter((d): d is string => Boolean(d)))];
    return dates.length > 0 ? `(${dates.join(", ")})` : null;
  };

  if (diagnosis.noMeasurements) {
    return (
      <Card title="Diagnóstico antropométrico">
        <p className="text-sm text-muted-foreground">{DIAGNOSIS_TEXT.noMeasurements}</p>
      </Card>
    );
  }

  if (diagnosis.minor) {
    return (
      <Card title="Diagnóstico antropométrico" description={description}>
        <Alert tone="info" className="mb-4">
          {MINOR_WARNING_TEXT}
        </Alert>
        <dl className="divide-y text-sm">
          <IndicatorRow
            label="IMC"
            row={diagnosis.bmi}
            tones={BMI_TONES}
            decimals={1}
            source={datesOf("weightKg", "heightCm")}
          />
        </dl>
      </Card>
    );
  }

  const bodyFat = diagnosis.estimatedBodyFat;
  const measuredText = measuredBodyFat
    ? `medido: ${formatDecimalEs(measuredBodyFat.percent, 1)} % (bioimpedancia ${measuredBodyFat.dateLabel})`
    : null;

  return (
    <Card title="Diagnóstico antropométrico" description={description}>
      <dl className="divide-y text-sm">
        <IndicatorRow
          label="IMC"
          row={diagnosis.bmi}
          tones={BMI_TONES}
          decimals={1}
          reference={BMI_HEALTHY_RANGE_TEXT}
          source={datesOf("weightKg", "heightCm")}
        />
        {diagnosis.waist ? (
          <IndicatorRow
            label="Cintura"
            row={diagnosis.waist}
            tones={WAIST_TONES}
            unit="cm"
            decimals={1}
            source={datesOf("waistCm")}
          />
        ) : null}
        {diagnosis.waistHipRatio ? (
          <IndicatorRow
            label="Índice cintura/cadera"
            row={diagnosis.waistHipRatio}
            tones={WAIST_HIP_TONES}
            decimals={2}
            reference={diagnosis.waistHipRatio.thresholdText}
            source={datesOf("waistCm", "hipCm")}
          />
        ) : null}
        {diagnosis.waistToHeight ? (
          <IndicatorRow
            label="Cintura/talla"
            row={diagnosis.waistToHeight}
            tones={HEALTHY_TONES}
            decimals={2}
            reference="<0,50"
            source={datesOf("waistCm", "heightCm")}
          />
        ) : null}
        {diagnosis.conicity ? (
          <IndicatorRow
            label="Índice de conicidad"
            row={diagnosis.conicity}
            tones={HEALTHY_TONES}
            decimals={2}
            reference="<1,4"
            source={datesOf("waistCm", "weightKg", "heightCm")}
          />
        ) : null}
        {bodyFat ? (
          <Row label="% de grasa estimado">
            {bodyFat.status === "ok" ? (
              <>
                <Quantity value={bodyFat.value} unit="%" decimals={1} />
                <Muted>Deurenberg, estimación poblacional</Muted>
              </>
            ) : (
              <Muted>{bodyFat.note}</Muted>
            )}
            {measuredText ? <Muted>{measuredText}</Muted> : null}
          </Row>
        ) : null}
      </dl>

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold">Peso ideal</h3>
        {diagnosis.idealWeights ? (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Fórmula</TableHead>
                  <TableHead numeric>Peso ideal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnosis.idealWeights.map((row) => (
                  <TableRow key={row.formula}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell numeric>
                      {row.valueKg !== null ? (
                        <Quantity value={row.valueKg} unit="kg" decimals={1} />
                      ) : (
                        <span className="text-muted-foreground">{row.note}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {diagnosis.percentOfIdealDevine !== null ? (
              <p className="mt-3 text-sm tabular-nums">{DIAGNOSIS_TEXT.percentOfIdeal(diagnosis.percentOfIdealDevine)}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{DIAGNOSIS_TEXT.missingHeight}</p>
        )}
      </div>

      {diagnosis.adjustedWeightSuggestion ? (
        <Alert tone="warning" className="mt-4">
          {DIAGNOSIS_TEXT.adjustedWeightAlert(diagnosis.adjustedWeightSuggestion.adjustedKg)}
        </Alert>
      ) : null}
    </Card>
  );
}

function fixedDecimals(value: number, decimals: number): string {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(
    value,
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right">{children}</dd>
    </div>
  );
}

function IndicatorRow<K extends string>({
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
