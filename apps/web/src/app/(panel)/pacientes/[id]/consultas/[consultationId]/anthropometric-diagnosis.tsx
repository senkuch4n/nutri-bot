import {
  BMI_HEALTHY_RANGE_TEXT,
  DIAGNOSIS_TEXT,
  PEDIATRIC_TEXT,
  formatDecimalEs,
  type AnthropometricDiagnosis,
} from "@nutri-bot/core";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/primitives/table";
import { Alert, Card, Quantity } from "@/components/ui";
import {
  BMI_FOR_AGE_TONES,
  BMI_TONES,
  GrowthIndicatorRow,
  HEALTHY_TONES,
  HEIGHT_FOR_AGE_TONES,
  IndicatorRow,
  Muted,
  Row,
  WAIST_HIP_TONES,
  WAIST_TONES,
} from "./diagnosis-rows";

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

  // HU-008: 5 a 17 años, referencia OMS 2007 (IMC para la edad y talla para la edad).
  if (diagnosis.ageGroup === "PEDIATRIC" && diagnosis.pediatric) {
    const { pediatric } = diagnosis;
    return (
      <Card title="Diagnóstico antropométrico" description={description}>
        <Alert tone="info" className="mb-4">
          {PEDIATRIC_TEXT.diagnosisInfo}
        </Alert>
        <dl className="divide-y text-sm">
          <GrowthIndicatorRow
            label={PEDIATRIC_TEXT.bmiForAgeLabel}
            row={pediatric.bmiForAge}
            tones={BMI_FOR_AGE_TONES}
            decimals={1}
            reference={PEDIATRIC_TEXT.bmiForAgeReference}
            source={datesOf("weightKg", "heightCm")}
          />
          <GrowthIndicatorRow
            label={PEDIATRIC_TEXT.heightForAgeLabel}
            row={pediatric.heightForAge}
            tones={HEIGHT_FOR_AGE_TONES}
            unit="cm"
            decimals={1}
            reference={PEDIATRIC_TEXT.heightForAgeReference}
            source={datesOf("heightCm")}
          />
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{pediatric.footer}</p>
      </Card>
    );
  }

  // HU-008: menores de 5, sin referencias (D18): el IMC sin clasificar, como antes.
  if (diagnosis.minor) {
    return (
      <Card title="Diagnóstico antropométrico" description={description}>
        <Alert tone="warning" className="mb-4">
          {PEDIATRIC_TEXT.under5}
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
