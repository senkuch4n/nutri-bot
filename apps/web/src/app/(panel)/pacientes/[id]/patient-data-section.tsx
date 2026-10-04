import type { ReactNode } from "react";
import { Scale } from "lucide-react";
import {
  ACTIVITY_PLAIN_LABELS,
  PATIENT_SUMMARY_TEXT,
  PEDIATRIC_TEXT,
  activityLevelOption,
  ageGroupOf,
  bodyFrameLabel,
  formatDecimalEs,
  formatMacroAmount,
  getMissingFormulaData,
  missingForCaloriesText,
  nutritionGoalLabel,
  sexLabel,
  type ActivityLevel,
  type BodyFrame,
  type NutritionGoal,
  type Sex,
} from "@nutri-bot/core";
import { GroupedList } from "@/components/grouped-list";
import { Alert, Quantity } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ClinicalAlert } from "./clinical-alert";
import { DetailDisclosure } from "./detail-disclosure";
import { EditPatientButton } from "./edit-patient-sheet";
import { PATIENT_DATA_ID, PATIENT_DATA_TITLE_ID, PatientTabButton } from "./patient-tabs";

const T = PATIENT_SUMMARY_TEXT;

export type DatedMeasurement = { value: number; dateLabel: string } | null;

export interface PatientDataSectionProps {
  ageYears: number | null;
  values: { sex: Sex | null; activityLevel: ActivityLevel | null; nutritionGoal: NutritionGoal | null; bodyFrame: BodyFrame | null };
  background: string | null;
  goals: string | null;
  riskFlag: boolean;
  weight: DatedMeasurement;
  height: DatedMeasurement;
  bodyFat: DatedMeasurement;
  /** Última prescripción (Calorías indicadas). */
  prescription: { kcal: number; proteinG: number; fatG: number; carbG: number; dateLabel: string } | null;
}

/** Una fila de la lista agrupada: dato a la izquierda y valor a la derecha (o debajo, si es texto largo
 *  o no entra). Lo que falta va en gris, sin aspecto de botón. */
function DataRow({ label, value, stacked = false }: { label: string; value: ReactNode | null; stacked?: boolean }) {
  return (
    <li className="relative after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border last:after:hidden">
      <div
        className={cn(
          "flex min-h-11 px-4 py-2.5 text-callout",
          stacked ? "flex-col gap-0.5" : "flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5",
        )}
      >
        <span className="text-foreground">{label}</span>
        <span
          className={cn(
            value === null ? "text-muted-foreground" : "text-foreground",
            stacked ? "whitespace-pre-wrap break-words" : "text-right tabular-nums",
          )}
        >
          {value ?? T.notLoaded}
        </span>
      </div>
    </li>
  );
}

const FORMULA_USES = [
  "Sexo, edad, peso y talla: el gasto en reposo (TMB) con Mifflin-St Jeor y Harris-Benedict; en menores de 18 años, Schofield.",
  "Grasa corporal: Katch-McArdle y Cunningham.",
  "Actividad física: multiplica la TMB para el gasto total del día.",
  "Objetivo: el ajuste de calorías (déficit, mantenimiento o superávit).",
  "Contextura: el peso ideal (Hamwi).",
] as const;

/** "Datos de la paciente" (HU-017c-2): reemplaza a "Datos para cálculos", "Requerimiento indicado" y la
 *  pestaña "Datos y ficha clínica". Lenguaje común arriba; lo técnico, en "Ver detalle". */
export function PatientDataSection({
  ageYears,
  values,
  background,
  goals,
  riskFlag,
  weight,
  height,
  bodyFat,
  prescription,
}: PatientDataSectionProps) {
  const group = ageGroupOf(ageYears);
  const missing = getMissingFormulaData({
    ...values,
    hasBirthDate: ageYears !== null,
    weightKg: weight?.value ?? null,
    heightCm: height?.value ?? null,
  });
  const missingText = missingForCaloriesText(missing);
  const missingInSheet = missing.some((i) => i.key !== "weight" && i.key !== "height");
  const missingMeasures = missing.some((i) => i.key === "weight" || i.key === "height");
  const activity = activityLevelOption(values.activityLevel);
  const measured = (m: DatedMeasurement, unit: string, empty: string) =>
    m ? (
      <>
        <Quantity value={m.value} unit={unit} /> <span className="text-muted-foreground">({m.dateLabel})</span>
      </>
    ) : (
      <span className="text-muted-foreground">{empty}</span>
    );

  return (
    <section id={PATIENT_DATA_ID} aria-labelledby={PATIENT_DATA_TITLE_ID} className="scroll-mt-[var(--patient-chrome-h)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2
          id={PATIENT_DATA_TITLE_ID}
          tabIndex={-1}
          className="rounded-sm text-title-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {T.dataTitle}
        </h2>
        <EditPatientButton />
      </div>

      {missingText || group !== "ADULT" || (riskFlag && background) ? (
        <div className="mb-4 space-y-3">
          {riskFlag && background ? <ClinicalAlert background={background} /> : null}
          {missingText ? (
            <Alert tone="warning">
              <p>{missingText}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {missingInSheet ? <EditPatientButton variant="tinted" size="sm">{T.complete}</EditPatientButton> : null}
                {missingMeasures ? (
                  <PatientTabButton tab="historial" view="medidas" variant={missingInSheet ? "secondary" : "tinted"}>
                    <Scale aria-hidden />
                    {T.loadWeight}
                  </PatientTabButton>
                ) : null}
              </div>
            </Alert>
          ) : null}
          {group === "PEDIATRIC" ? <Alert tone="info">{PEDIATRIC_TEXT.formulaDataInfo}</Alert> : null}
          {group === "UNDER_5" ? <Alert tone="warning">{PEDIATRIC_TEXT.under5}</Alert> : null}
        </div>
      ) : null}

      <GroupedList>
        <DataRow label="Edad" value={ageYears !== null ? T.ageYears(ageYears) : null} />
        <DataRow label="Sexo" value={sexLabel(values.sex)} />
        <DataRow label="Objetivo" value={nutritionGoalLabel(values.nutritionGoal)} />
        <DataRow label="Actividad física" value={values.activityLevel ? ACTIVITY_PLAIN_LABELS[values.activityLevel] : null} />
        <DataRow label="Contextura" value={bodyFrameLabel(values.bodyFrame)} />
        {prescription ? (
          <DataRow
            label={T.caloriesLabel}
            value={T.caloriesPerDay(formatMacroAmount(prescription.kcal, "kcal"), prescription.dateLabel)}
          />
        ) : (
          <DataRow label={T.caloriesLabel} value={<span className="text-muted-foreground">{T.caloriesEmpty}</span>} stacked />
        )}
        <DataRow
          label={T.backgroundLabel}
          value={background ? (riskFlag ? `${background} ${T.riskSuffix}` : background) : null}
          stacked={Boolean(background)}
        />
        <DataRow label="Objetivos clínicos" value={goals} stacked={Boolean(goals)} />
      </GroupedList>

      <div className="mt-2 px-1">
        <DetailDisclosure label={T.seeDetail}>
          <div className="mt-1 space-y-4 rounded-xl bg-secondary/60 px-4 py-4 text-callout">
            <p className="text-muted-foreground">{T.dataDescription}</p>
            <ul className="space-y-1.5">
              {activity ? <li>{T.activityFactor(formatDecimalEs(activity.factor))}</li> : null}
              {values.bodyFrame === null ? <li>{T.bodyFrameDefault}</li> : null}
              <li>Peso: {measured(weight, "kg", T.notLoaded)}</li>
              <li>Talla: {measured(height, "cm", T.notLoaded)}</li>
              <li>Grasa corporal: {measured(bodyFat, "%", T.notMeasured)}</li>
            </ul>
            {prescription ? (
              <div>
                <p className="font-medium">
                  {T.caloriesLabel} ({prescription.dateLabel})
                </p>
                <ul className="mt-1 space-y-1 tabular-nums">
                  <li>Proteínas: {formatMacroAmount(prescription.proteinG, "g")}</li>
                  <li>Grasas: {formatMacroAmount(prescription.fatG, "g")}</li>
                  <li>Carbohidratos: {formatMacroAmount(prescription.carbG, "g")}</li>
                </ul>
              </div>
            ) : null}
            <div>
              <p className="font-medium">Qué fórmulas usan cada dato</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {FORMULA_USES.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </DetailDisclosure>
      </div>
    </section>
  );
}
