"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import {
  ACTIVITY_LEVELS,
  DEFAULT_MACRO_PERCENTS,
  DEFAULT_PROTEIN_G_PER_KG,
  NUTRITION_GOALS,
  PEDIATRIC_TEXT,
  REQUIREMENT_TEXT,
  activityLevelOption,
  adjustmentRangeFor,
  adjustmentRangeHint,
  adjustmentRangeOptionLabel,
  adjustmentRangesFor,
  bmrFormulasFor,
  calculateRequirement,
  defaultAdjustmentPercent,
  formatDecimalEs,
  formatMacroAmount,
  initialAdjustmentRange,
  macroReferenceFor,
  macroReferenceHint,
  nutritionGoalLabel,
  roundTo,
  schofieldBandLabel,
  vctDifferenceText,
  type ActivityLevel,
  type AdjustmentRangeKey,
  type BmrFormula,
  type MacroChoices,
  type MacroLine,
  type NutritionGoal,
  type RequirementContext,
  type RequirementDraft,
  type WeightBasis,
} from "@nutri-bot/core";
import { DataTable, type DataTableColumn } from "@/components/data-table";
import { NumberInput } from "@/components/number-input";
import { RadioGroup, RadioGroupItem } from "@/components/primitives/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/primitives/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/primitives/toggle-group";
import { Alert, Badge, Button, Field, FormError, Select } from "@/components/ui";
import { notify } from "@/lib/notify";
import { savePrescriptionAction } from "../../prescription-actions";

export interface CalculatorProps {
  ctx: RequirementContext;
  initialDraft: RequirementDraft;
  editing: boolean;
  measuredBodyFat: { percent: number; dateLabel: string } | null;
  /** basalMetabolicRateKcal D4 (D8). `fromOtherConsultation` decide si se muestra la fecha. */
  measuredBmr: { kcal: number; dateLabel: string; fromOtherConsultation: boolean } | null;
  patientActivityLevel: ActivityLevel | null;
  patientNutritionGoal: NutritionGoal | null;
}

/** Valores de los campos numéricos como texto: el campo puede estar a medio escribir. */
type NumberFields = {
  adjustment: string;
  vct: string;
  proteinPercent: string;
  fatPercent: string;
  carbPercent: string;
  proteinGPerKg: string;
};

const numText = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

/** "" → null; lo demás, Number (NaN si no es número: lo marca como error la validación de core). */
function parseNumber(text: string): number | null {
  const t = text.trim().replace(",", ".");
  return t === "" ? null : Number(t);
}

const kcal = (v: number) => formatMacroAmount(v, "kcal");
const kcalNumber = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0, useGrouping: true });
const kg1 = (v: number) => formatDecimalEs(roundTo(v, 1), 1);

/**
 * Calculadora de requerimiento (HU-004, 7.3): pasos numerados que se recalculan al instante con
 * packages/core. Guarda con onClick + startTransition (sin <form action>).
 */
export function RequirementCalculator({
  patientId,
  consultationId,
  calculator,
  initialDraft,
  vctInitiallyTouched,
  onDone,
}: {
  patientId: string;
  consultationId: string;
  calculator: CalculatorProps;
  initialDraft: RequirementDraft;
  vctInitiallyTouched: boolean;
  onDone: () => void;
}) {
  const { ctx, measuredBodyFat, measuredBmr, patientActivityLevel, patientNutritionGoal } = calculator;
  const baseId = useId();

  const [bmrFormula, setBmrFormula] = useState<BmrFormula>(initialDraft.bmrFormula);
  const [weightBasis, setWeightBasis] = useState<WeightBasis>(initialDraft.weightBasis);
  const [bodyFatSource, setBodyFatSource] = useState(initialDraft.bodyFatSource);
  const [activityLevel, setActivityLevel] = useState(initialDraft.activityLevel);
  const [nutritionGoal, setNutritionGoal] = useState(initialDraft.nutritionGoal);
  const [adjustmentRange, setAdjustmentRange] = useState(initialDraft.adjustmentRange);
  const [macroMode, setMacroMode] = useState(initialDraft.macros.mode);
  const [fields, setFields] = useState<NumberFields>(() => {
    const m = initialDraft.macros;
    return {
      adjustment: numText(initialDraft.adjustmentPercent),
      vct: numText(initialDraft.prescribedVctKcal),
      proteinPercent: numText(m.mode === "PERCENT_OF_VCT" ? m.proteinPercent : DEFAULT_MACRO_PERCENTS.proteinPercent),
      fatPercent: numText(m.fatPercent),
      carbPercent: numText(m.mode === "PERCENT_OF_VCT" ? m.carbPercent : DEFAULT_MACRO_PERCENTS.carbPercent),
      proteinGPerKg: numText(m.mode === "PROTEIN_PER_KG" ? m.proteinGPerKg : DEFAULT_PROTEIN_G_PER_KG),
    };
  });
  const [vctTouched, setVctTouched] = useState(vctInitiallyTouched);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  const setField = (key: keyof NumberFields) => (text: string) => {
    setFields((prev) => ({ ...prev, [key]: text }));
    setServerError(null);
  };

  const macros: MacroChoices =
    macroMode === "PERCENT_OF_VCT"
      ? {
          mode: "PERCENT_OF_VCT",
          proteinPercent: parseNumber(fields.proteinPercent) ?? Number.NaN,
          fatPercent: parseNumber(fields.fatPercent) ?? Number.NaN,
          carbPercent: parseNumber(fields.carbPercent) ?? Number.NaN,
        }
      : {
          mode: "PROTEIN_PER_KG",
          proteinGPerKg: parseNumber(fields.proteinGPerKg) ?? Number.NaN,
          fatPercent: parseNumber(fields.fatPercent) ?? Number.NaN,
        };

  const baseDraft: RequirementDraft = {
    bmrFormula,
    weightBasis,
    bodyFatSource,
    activityLevel,
    nutritionGoal,
    adjustmentRange,
    adjustmentPercent: adjustmentRange === "MAINTENANCE" ? 0 : parseNumber(fields.adjustment),
    prescribedVctKcal: null,
    macros,
  };

  // Primero sin VCT indicado, para saber el calculado; mientras no lo toquen, el indicado lo sigue (D7).
  const calculatedVct = calculateRequirement(ctx, baseDraft).calculatedVctKcal;
  const roundedCalculated = calculatedVct === null ? null : Math.round(calculatedVct);
  const prescribedVctKcal = vctTouched ? parseNumber(fields.vct) : roundedCalculated;
  const draft: RequirementDraft = { ...baseDraft, prescribedVctKcal };
  const calc = calculateRequirement(ctx, draft);

  // HU-008: en pediátricos (5 a 17) cambian las fórmulas, los rangos y la referencia de macros.
  const population = ctx.population;
  const pediatric = population === "PEDIATRIC";
  const stepOffset = pediatric ? 0 : 1; // sin el paso "Peso para las fórmulas" se renumera
  const macroRef = macroReferenceFor(population);
  const goalRanges = nutritionGoal ? adjustmentRangesFor(nutritionGoal, population) : [];
  const range = nutritionGoal && adjustmentRange ? adjustmentRangeFor(nutritionGoal, adjustmentRange, population) : null;
  const activityDiffers = patientActivityLevel !== null && activityLevel !== patientActivityLevel;
  const goalDiffers = patientNutritionGoal !== null && nutritionGoal !== patientNutritionGoal;

  function changeGoal(value: string) {
    const goal = (value || null) as NutritionGoal | null;
    setNutritionGoal(goal);
    const first = initialAdjustmentRange(goal, null, population);
    setAdjustmentRange(first?.key ?? null);
    setFields((prev) => ({ ...prev, adjustment: first ? String(defaultAdjustmentPercent(first)) : "" }));
    setServerError(null);
  }

  function changeRange(value: string) {
    const key = (value || null) as AdjustmentRangeKey | null;
    setAdjustmentRange(key);
    const r = key && nutritionGoal ? adjustmentRangeFor(nutritionGoal, key, population) : null;
    setFields((prev) => ({ ...prev, adjustment: r ? String(defaultAdjustmentPercent(r)) : "" }));
    setServerError(null);
  }

  function save() {
    if (calc.errors.length > 0 || !activityLevel || !nutritionGoal || !adjustmentRange) return;
    const payload = {
      patientId,
      consultationId,
      ...draft,
      activityLevel,
      nutritionGoal,
      adjustmentRange,
    };
    setServerError(null);
    startTransition(async () => {
      const res = await savePrescriptionAction(payload);
      if (res.ok) {
        notify.saved(REQUIREMENT_TEXT.saved);
        onDone();
      } else {
        setServerError(res.error ?? REQUIREMENT_TEXT.invalid);
      }
    });
  }

  // ── Paso 2: textos del dato que usa cada fórmula ──
  const bodyFatUsage: ReactNode =
    calc.bodyFatPercent === null ? (
      REQUIREMENT_TEXT.noBodyFat
    ) : bodyFatSource === "DEURENBERG" ? (
      <>
        con {formatDecimalEs(roundTo(calc.bodyFatPercent, 1), 1)} % de grasa (estimado, Deurenberg){" "}
        <Badge tone="neutral">estimado</Badge>
      </>
    ) : (
      `con ${formatDecimalEs(roundTo(calc.bodyFatPercent, 1), 1)} % de grasa (bioimpedancia ${measuredBodyFat?.dateLabel ?? ""})`
    );

  const macroColumns: DataTableColumn<MacroLine>[] = [
    { id: "macro", header: "Macro", cell: (l) => l.label },
    { id: "percent", header: "%", numeric: true, cell: (l) => `${formatDecimalEs(roundTo(l.percent, 1), 1)} %` },
    { id: "kcal", header: "kcal", numeric: true, cell: (l) => kcalNumber.format(l.kcal) },
    { id: "grams", header: "g por día", numeric: true, cell: (l) => formatMacroAmount(Math.round(l.grams), "g") },
    {
      id: "gPerKg",
      header: weightBasis === "ADJUSTED" ? "g/kg de peso ajustado" : "g/kg",
      numeric: true,
      cell: (l) => formatDecimalEs(roundTo(l.gramsPerKg, 1), 1),
    },
  ];

  const errorsId = `${baseId}-errors`;

  return (
    <div className="space-y-8">
      <ol className="space-y-8">
        {/* 1. Peso (solo adultos: en menores se usa el peso actual, D14) */}
        {!pediatric && calc.adjustedWeightKg !== null ? (
          <Step number={1} title="Peso para las fórmulas">
            <ToggleGroup
              type="single"
              variant="outline"
              value={weightBasis}
              onValueChange={(v) => v && setWeightBasis(v as WeightBasis)}
              aria-label="Peso para las fórmulas"
              className="grid max-w-md grid-cols-2 gap-0 rounded-md border border-input p-0.5 [&>button]:border-0"
            >
              <ToggleGroupItem value="ACTUAL" className="tabular-nums data-[state=on]:font-semibold">
                Actual ({kg1(ctx.actualWeightKg)} kg)
              </ToggleGroupItem>
              <ToggleGroupItem value="ADJUSTED" className="tabular-nums data-[state=on]:font-semibold">
                Ajustado ({kg1(calc.adjustedWeightKg)} kg)
              </ToggleGroupItem>
            </ToggleGroup>
            {calc.suggestAdjustedWeight ? (
              <p className="mt-2 text-xs text-muted-foreground">Sugerido: supera el 130 % del peso ideal</p>
            ) : null}
          </Step>
        ) : null}

        {/* 2. TMB */}
        <Step number={1 + stepOffset} title="Tasa metabólica basal (TMB)">
          <RadioGroup
            value={bmrFormula}
            onValueChange={(v) => setBmrFormula(v as BmrFormula)}
            aria-label="Fórmula de TMB"
            className="block"
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <span className="sr-only">Elegida</span>
                  </TableHead>
                  <TableHead>Fórmula</TableHead>
                  <TableHead numeric>TMB</TableHead>
                  <TableHead>Dato que usa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bmrFormulasFor(population).map((f) => {
                  const value = calc.bmrByFormula[f.value];
                  const itemId = `${baseId}-bmr-${f.value}`;
                  return (
                    <TableRow key={f.value} className={value === null ? "text-muted-foreground" : undefined}>
                      <TableCell>
                        <RadioGroupItem value={f.value} id={itemId} disabled={value === null} />
                      </TableCell>
                      <TableCell>
                        <label htmlFor={itemId} className={value === null ? "cursor-not-allowed" : "cursor-pointer"}>
                          {f.label}
                        </label>
                      </TableCell>
                      <TableCell numeric>{value === null ? "—" : kcal(value)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {f.needsBodyFat
                          ? bodyFatUsage
                          : f.value === "SCHOFIELD_WEIGHT_HEIGHT"
                            ? `con ${kg1(calc.weightUsedKg)} kg y ${formatDecimalEs(ctx.heightCm, 1)} cm`
                            : `con ${kg1(calc.weightUsedKg)} kg`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </RadioGroup>
          {pediatric ? (
            <p className="mt-2 text-xs text-muted-foreground">{schofieldBandLabel(ctx.sex, ctx.ageYears)}</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {calc.bodyFatPercent === null ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setBodyFatSource("DEURENBERG")}>
                  Usar el estimado de Deurenberg
                </Button>
              ) : null}
              {bodyFatSource === "DEURENBERG" && measuredBodyFat ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setBodyFatSource("MEASURED")}>
                  Usar el % medido ({formatDecimalEs(measuredBodyFat.percent, 1)} %)
                </Button>
              ) : null}
            </div>
          )}
          {measuredBmr ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Medido por bioimpedancia: {kcal(measuredBmr.kcal)}
              {measuredBmr.fromOtherConsultation ? ` (${measuredBmr.dateLabel})` : ""}
            </p>
          ) : null}
        </Step>

        {/* 3. Actividad */}
        <Step
          number={2 + stepOffset}
          title="Actividad"
          result={calc.totalExpenditureKcal !== null ? `GET ${kcal(calc.totalExpenditureKcal)}` : null}
        >
          <div className="max-w-md">
            <Field
              label="Actividad física"
              hint={
                activityDiffers
                  ? `Distinto del dato del paciente (${activityLevelOption(patientActivityLevel)?.label})`
                  : undefined
              }
            >
              <Select
                value={activityLevel ?? ""}
                onChange={(e) => {
                  setActivityLevel((e.target.value || null) as ActivityLevel | null);
                  setServerError(null);
                }}
              >
                <option value="">Elegí…</option>
                {ACTIVITY_LEVELS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {`${a.label} (×${formatDecimalEs(a.factor)}) — ${a.description}`}
                  </option>
                ))}
              </Select>
            </Field>
            {pediatric ? <p className="mt-2 text-xs text-muted-foreground">{PEDIATRIC_TEXT.activityHint}</p> : null}
          </div>
        </Step>

        {/* 4. Objetivo */}
        <Step
          number={3 + stepOffset}
          title="Objetivo"
          result={calc.calculatedVctKcal !== null ? `VCT calculado ${kcal(calc.calculatedVctKcal)}` : null}
        >
          <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <Field
              label="Objetivo"
              hint={goalDiffers ? `Distinto del dato del paciente (${nutritionGoalLabel(patientNutritionGoal)})` : undefined}
            >
              <Select value={nutritionGoal ?? ""} onChange={(e) => changeGoal(e.target.value)}>
                <option value="">Elegí…</option>
                {NUTRITION_GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>
            {goalRanges.length > 1 ? (
              <Field label="Tipo de ajuste">
                <Select value={adjustmentRange ?? ""} onChange={(e) => changeRange(e.target.value)}>
                  <option value="">Elegí…</option>
                  {goalRanges.map((r) => (
                    <option key={r.key} value={r.key}>
                      {adjustmentRangeOptionLabel(r)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {range && range.key !== "MAINTENANCE" ? (
              <Field
                label="Ajuste"
                hint={[adjustmentRangeHint(range), range.label !== range.shortLabel ? range.label : null]
                  .filter(Boolean)
                  .join(" · ")}
              >
                <NumberInput name="adjustmentPercent" autoComplete="off"
                  unit="%"
                  step={1}
                  value={fields.adjustment}
                  onChange={(e) => setField("adjustment")(e.target.value)}
                />
              </Field>
            ) : null}
          </div>
        </Step>

        {/* 5. VCT indicado */}
        <Step number={4 + stepOffset} title="VCT indicado">
          <div className="max-w-xs">
            <Field label="VCT indicado">
              <NumberInput name="prescribedVctKcal" autoComplete="off"
                unit="kcal"
                step={1}
                value={vctTouched ? fields.vct : numText(roundedCalculated)}
                onChange={(e) => {
                  setVctTouched(true);
                  setField("vct")(e.target.value);
                }}
              />
            </Field>
          </div>
          {prescribedVctKcal !== null &&
          roundedCalculated !== null &&
          Number.isFinite(prescribedVctKcal) &&
          prescribedVctKcal !== roundedCalculated ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {vctDifferenceText(prescribedVctKcal, roundedCalculated)}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setVctTouched(false)}>
                Volver al calculado
              </Button>
            </div>
          ) : null}
        </Step>

        {/* 6. Macros */}
        <Step number={5 + stepOffset} title="Macronutrientes">
          <ToggleGroup
            type="single"
            variant="outline"
            value={macroMode}
            onValueChange={(v) => {
              if (!v) return;
              setMacroMode(v as MacroChoices["mode"]);
              setServerError(null);
            }}
            aria-label="Cómo se reparten los macronutrientes"
            className="mb-4 grid max-w-md grid-cols-2 gap-0 rounded-md border border-input p-0.5 [&>button]:border-0"
          >
            <ToggleGroupItem value="PERCENT_OF_VCT" className="data-[state=on]:font-semibold">
              Porcentajes del VCT
            </ToggleGroupItem>
            <ToggleGroupItem value="PROTEIN_PER_KG" className="data-[state=on]:font-semibold">
              Proteína en g/kg
            </ToggleGroupItem>
          </ToggleGroup>

          {macroMode === "PERCENT_OF_VCT" ? (
            <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
              <Field label="Proteínas" hint={macroReferenceHint(macroRef.proteinPercent, "%")}>
                <NumberInput name="proteinPercent" autoComplete="off" unit="%" step={0.1} value={fields.proteinPercent} onChange={(e) => setField("proteinPercent")(e.target.value)} />
              </Field>
              <Field label="Grasas" hint={macroReferenceHint(macroRef.fatPercent, "%")}>
                <NumberInput name="fatPercent" autoComplete="off" unit="%" step={0.1} value={fields.fatPercent} onChange={(e) => setField("fatPercent")(e.target.value)} />
              </Field>
              <Field label="Carbohidratos" hint={macroReferenceHint(macroRef.carbPercent, "%")}>
                <NumberInput name="carbPercent" autoComplete="off" unit="%" step={0.1} value={fields.carbPercent} onChange={(e) => setField("carbPercent")(e.target.value)} />
              </Field>
            </div>
          ) : (
            <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
              <Field
                label="Proteínas"
                hint={pediatric ? PEDIATRIC_TEXT.proteinGPerKgHint : macroReferenceHint(macroRef.proteinGPerKg, "g/kg")}
              >
                <NumberInput name="proteinGPerKg" autoComplete="off" unit="g/kg" step={0.1} value={fields.proteinGPerKg} onChange={(e) => setField("proteinGPerKg")(e.target.value)} />
              </Field>
              <Field label="Grasas" hint={macroReferenceHint(macroRef.fatPercent, "%")}>
                <NumberInput name="fatPercent" autoComplete="off" unit="%" step={0.1} value={fields.fatPercent} onChange={(e) => setField("fatPercent")(e.target.value)} />
              </Field>
              <div className="self-center text-sm text-muted-foreground sm:pt-6">Carbohidratos: el resto</div>
            </div>
          )}

          {calc.macros ? (
            <>
              {macroMode === "PERCENT_OF_VCT" ? (
                <p className="mt-3 text-sm tabular-nums" aria-live="polite">
                  Suma: {Number.isFinite(calc.macros.percentSum) ? formatDecimalEs(roundTo(calc.macros.percentSum, 1), 1) : "—"} %
                </p>
              ) : null}
              <div className="mt-4">
                <DataTable
                  columns={macroColumns}
                  rows={calc.macros.lines}
                  getRowId={(l) => l.key}
                  caption="Reparto de macronutrientes"
                />
              </div>
              {calc.warnings.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {calc.warnings.map((w) => (
                    <Alert key={w} tone="warning">
                      {w}
                    </Alert>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </Step>
      </ol>

      <div className="space-y-3 border-t pt-4">
        {calc.errors.length > 0 ? (
          <ul id={errorsId} aria-live="polite" className="space-y-1 text-sm text-destructive">
            {calc.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
        <FormError message={serverError} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            loading={saving}
            disabled={calc.errors.length > 0}
            aria-describedby={calc.errors.length > 0 ? errorsId : undefined}
            onClick={save}
          >
            {saving ? "Guardando…" : "Guardar prescripción"}
          </Button>
          <Button type="button" variant="ghost" disabled={saving} onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  result,
  children,
}: {
  number: number;
  title: string;
  result?: string | null;
  children: ReactNode;
}) {
  return (
    <li>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">
          {number}. {title}
        </h3>
        {result !== undefined ? (
          <output aria-live="polite" className="text-sm font-semibold tabular-nums">
            {result ?? ""}
          </output>
        ) : null}
      </div>
      {children}
    </li>
  );
}
