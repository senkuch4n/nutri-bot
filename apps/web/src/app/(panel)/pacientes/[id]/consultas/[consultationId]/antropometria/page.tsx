import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import {
  BMI_HEALTHY_RANGE_TEXT,
  ISAK_METHOD_LABELS,
  ISAK_TEXT,
  MUSCLE_BONE_CLASS_LABELS,
  MUSCLE_BONE_TABLE,
  PEDIATRIC_TEXT,
  buildIsakStudy,
  computeAgeMonths,
  computeAgeYears,
  daysBetweenDayKeys,
  dayKeyInTz,
  formatFixedEs,
  formatInTimeZone,
  getMissingFormulaData,
  missingFormulaDataMessage,
  sexLabel,
  type IsakClassified,
  type IsakStudyResult,
  type IsakTissue,
  type IsakValue,
} from "@nutri-bot/core";
import { FileText } from "lucide-react";
import {
  getAnthropometricReportMeta,
  getConsultation,
  getIsakStudy,
  getPreviousIsakStudy,
  toIsakMeasures,
} from "@nutri-bot/db/domain";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/primitives/table";
import { Alert, Badge, Button, ButtonLink, Card, PageHeader, StatTile } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { FormulaDataForm } from "../../../formula-data-form";
import { FormulaDataSheet } from "../../../formula-data-sheet";
import { DeleteIsakStudyButton } from "../delete-isak-study-button";
import {
  BMI_FOR_AGE_TONES,
  BMI_TONES,
  GrowthIndicatorRow,
  HEALTHY_TONES,
  HEIGHT_FOR_AGE_TONES,
  IndicatorRow,
  MUSCLE_BONE_TONES,
  Muted,
  Row,
  WAIST_HIP_TONES,
} from "../diagnosis-rows";
import { IsakMeasuresTable, IsakValueText, PreviousCells, diffText } from "./isak-measures-table";
import { Somatochart } from "./somatochart";
import { TissueStackedBar } from "./tissue-stacked-bar";

export const dynamic = "force-dynamic";

/** "Anterior 4,95 (−0,92)" para filas y tiles (null si no hay anterior ok). */
function previousNote(current: IsakValue, previous: IsakValue | undefined, decimals: number): string | null {
  if (!previous || previous.status !== "ok") return null;
  return `Anterior ${formatFixedEs(previous.value, decimals)} (${diffText(current, previous, decimals)})`;
}

function PrevNote({ current, previous, decimals }: { current: IsakValue; previous: IsakValue | undefined; decimals: number }) {
  const note = previousNote(current, previous, decimals);
  return note ? <Muted>{note}</Muted> : null;
}

function classifiedValue<K extends string>(v: IsakClassified<K>): IsakValue {
  return v.status === "ok" ? { status: "ok", value: v.value } : v;
}

/** Estudio antropométrico ISAK completo de la consulta (HU-006, épicas 44 y 45). */
export default async function IsakStudyPage({ params }: { params: Promise<{ id: string; consultationId: string }> }) {
  const { id, consultationId } = await params;
  const [consultation, pro, entry] = await Promise.all([
    getConsultation(consultationId),
    getProfessional(),
    getIsakStudy(consultationId),
  ]);
  if (!consultation || consultation.patientId !== id) notFound();
  const consultationHref = `/pacientes/${id}/consultas/${consultationId}`;
  if (!entry) redirect(consultationHref);

  const tz = pro.timezone;
  const { patient } = consultation;
  const ageAt = (at: Date) => (patient.birthDate ? computeAgeYears(patient.birthDate, at, tz) : null);
  const age = ageAt(consultation.consultedAt);
  // HU-008: meses cumplidos a la fecha de cada estudio (IMC/E y T/E de la OMS 2007).
  const monthsAt = (at: Date) => (patient.birthDate ? computeAgeMonths(patient.birthDate, at, tz) : null);
  const current = buildIsakStudy({
    measures: toIsakMeasures(entry),
    sex: patient.sex,
    ageYears: age,
    ageMonths: monthsAt(consultation.consultedAt),
  });

  const [previousEntry, report] = await Promise.all([
    getPreviousIsakStudy({ patientId: id, before: consultation.consultedAt }),
    getAnthropometricReportMeta(entry.id),
  ]);
  const previousAt = previousEntry?.consultation?.consultedAt ?? null;
  const previous: IsakStudyResult | null =
    previousEntry && previousAt
      ? buildIsakStudy({
          measures: toIsakMeasures(previousEntry),
          sex: patient.sex,
          ageYears: ageAt(previousAt),
          ageMonths: monthsAt(previousAt),
        })
      : null;

  const dateLabel = (d: Date) => formatInTimeZone(d, tz, "dd/MM/yyyy");
  const description = [
    `Consulta del ${dateLabel(consultation.consultedAt)}`,
    age !== null ? `${age} años` : null,
    sexLabel(patient.sex),
  ]
    .filter(Boolean)
    .join(" · ");

  const missingItems = getMissingFormulaData({
    sex: patient.sex,
    activityLevel: patient.activityLevel,
    nutritionGoal: patient.nutritionGoal,
    hasBirthDate: patient.birthDate !== null,
    weightKg: null,
    heightCm: null,
  }).filter((i) => i.key === "sex" || i.key === "birthDate");
  const missingMessage = missingFormulaDataMessage(missingItems);

  const minor = current.minor;
  const withPrev = previous !== null;
  const prevHeads = withPrev ? (
    <>
      <TableHead numeric>Anterior (kg)</TableHead>
      <TableHead numeric>Dif. (kg)</TableHead>
    </>
  ) : null;

  const tissueRow = (label: string, t: IsakTissue, prev: IsakTissue | undefined, hasZ = true) => (
    <TableRow key={label}>
      <TableCell>{label}</TableCell>
      <TableCell numeric>
        <IsakValueText value={t.kg} decimals={2} />
      </TableCell>
      <TableCell numeric>
        <IsakValueText value={t.percent} decimals={2} />
      </TableCell>
      <TableCell numeric>{hasZ ? <IsakValueText value={t.z} decimals={2} /> : <span className="text-muted-foreground">—</span>}</TableCell>
      {withPrev ? <PreviousCells current={t.kg} previous={prev?.kg} decimals={2} /> : null}
    </TableRow>
  );

  const somato = current.somatotype;
  const prevSomato = previous?.somatotype;
  const somatoLabel = (s: IsakStudyResult["somatotype"]) =>
    s.endo.status === "ok" && s.meso.status === "ok" && s.ecto.status === "ok"
      ? [s.endo.value, s.meso.value, s.ecto.value].map((v) => formatFixedEs(v, 2)).join(" – ")
      : "";

  const compositionTable = (title: string, rows: ReactNode) => (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Componente</TableHead>
            <TableHead numeric>kg</TableHead>
            <TableHead numeric>%</TableHead>
            <TableHead numeric>Z</TableHead>
            {prevHeads}
          </TableRow>
        </TableHeader>
        <TableBody>{rows}</TableBody>
      </Table>
    </div>
  );

  const m = current.muscularity;
  const pm = previous?.muscularity;
  const indicatorRows: Array<{ label: string; value: IsakValue; prev?: IsakValue; z?: IsakValue; decimals: number; unit: string }> = [
    { label: "Sumatoria de 6 pliegues", value: current.adiposity.sum6, prev: previous?.adiposity.sum6, decimals: 1, unit: "mm" },
    { label: "Sumatoria de 8 pliegues", value: current.adiposity.sum8, prev: previous?.adiposity.sum8, decimals: 1, unit: "mm" },
    { label: "Brazo corregido", value: m.correctedArm.value, prev: pm?.correctedArm.value, z: m.correctedArm.z, decimals: 2, unit: "cm" },
    { label: "Muslo corregido", value: m.correctedThigh.value, prev: pm?.correctedThigh.value, z: m.correctedThigh.z, decimals: 2, unit: "cm" },
    { label: "Pierna corregida", value: m.correctedCalf.value, prev: pm?.correctedCalf.value, z: m.correctedCalf.z, decimals: 2, unit: "cm" },
    {
      label: "Diferencia brazo flexionado − brazo relajado",
      value: m.armDifference,
      prev: pm?.armDifference,
      decimals: 1,
      unit: "cm",
    },
  ];

  const proportionality = [
    { label: "Índice córmico", row: current.proportionality.cormic, prev: previous?.proportionality.cormic, decimals: 2 },
    { label: "Índice de Manouvrier", row: current.proportionality.manouvrier, prev: previous?.proportionality.manouvrier, decimals: 0 },
    { label: "Envergadura relativa", row: current.proportionality.relativeSpan, prev: previous?.proportionality.relativeSpan, decimals: 2 },
  ] as const;

  const health = current.health.diagnosis;
  const imo = current.compositionIndices.muscleBone;
  const prevImo = previous ? classifiedValue(previous.compositionIndices.muscleBone) : undefined;

  return (
    <div>
      <PageHeader
        title={ISAK_TEXT.cardTitle}
        description={description}
        back={{ href: consultationHref, label: "Volver a la consulta" }}
        action={
          <>
            <ButtonLink href={`${consultationHref}/antropometria/informe`} variant="secondary" size="sm">
              <FileText aria-hidden />
              {ISAK_TEXT.reportButton}
            </ButtonLink>
            <ButtonLink href={`${consultationHref}?isak=editar#antropometria-isak`} variant="secondary" size="sm">
              Editar
            </ButtonLink>
            <DeleteIsakStudyButton
              patientId={id}
              consultationId={consultationId}
              entryId={entry.id}
              redirectTo={consultationHref}
              hasReport={report !== null}
            />
          </>
        }
      />

      <div className="space-y-6">
        {minor || missingMessage || previousAt ? (
          <div className="space-y-3">
            {minor ? <Alert tone="info">{ISAK_TEXT.minorWarning}</Alert> : null}
            {missingMessage ? (
              <div className="space-y-3">
                <Alert tone="warning">{missingMessage}</Alert>
                <div className="flex flex-wrap gap-2">
                  {patient.sex === null ? (
                    <FormulaDataSheet
                      trigger={
                        <Button type="button" variant="secondary" size="sm">
                          Completar datos para cálculos
                        </Button>
                      }
                    >
                      <FormulaDataForm
                        patientId={id}
                        values={{
                          sex: patient.sex,
                          activityLevel: patient.activityLevel,
                          nutritionGoal: patient.nutritionGoal,
                          bodyFrame: patient.bodyFrame,
                        }}
                      />
                    </FormulaDataSheet>
                  ) : null}
                  {patient.birthDate === null ? (
                    <ButtonLink href={`/pacientes/${id}?tab=datos`} variant="secondary" size="sm">
                      Ir a Datos
                    </ButtonLink>
                  ) : null}
                </div>
              </div>
            ) : null}
            {previousAt ? (
              <p className="text-sm text-muted-foreground">
                {ISAK_TEXT.comparedWith(
                  dateLabel(previousAt),
                  daysBetweenDayKeys(dayKeyInTz(previousAt, tz), dayKeyInTz(consultation.consultedAt, tz)),
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 1. Medidas */}
        <Card title="Medidas">
          <IsakMeasuresTable current={current} previous={previous} />
        </Card>

        {/* 2. Composición corporal (no en menores, D13) */}
        {minor ? null : (
          <Card title="Composición corporal">
            <div className="space-y-6">
              {compositionTable(
                "Fraccionamiento molecular",
                <>
                  {tissueRow(ISAK_METHOD_LABELS.fatMass, current.molecular.fatMass, previous?.molecular.fatMass)}
                  {tissueRow(
                    ISAK_METHOD_LABELS.fatFreeMass,
                    { ...current.molecular.fatFreeMass, z: current.molecular.fatFreeMass.kg },
                    previous ? { ...previous.molecular.fatFreeMass, z: previous.molecular.fatFreeMass.kg } : undefined,
                    false,
                  )}
                </>,
              )}
              <div>
                {compositionTable(
                  "Fraccionamiento tisular",
                  <>
                    {tissueRow(ISAK_METHOD_LABELS.adipose, current.tissues.adipose, previous?.tissues.adipose)}
                    {tissueRow(ISAK_METHOD_LABELS.muscle, current.tissues.muscle, previous?.tissues.muscle)}
                    {tissueRow(ISAK_METHOD_LABELS.bone, current.tissues.bone, previous?.tissues.bone)}
                    {tissueRow(ISAK_METHOD_LABELS.residual, current.tissues.residual, previous?.tissues.residual)}
                  </>,
                )}
                {current.tissues.residual.negative ? (
                  <Alert tone="warning" className="mt-4">
                    {ISAK_TEXT.negativeResidual}
                  </Alert>
                ) : null}
                <TissueStackedBar tissues={current.tissues} />
              </div>
            </div>
          </Card>
        )}

        {/* 3. Distribución adiposo-muscular */}
        <Card title="Distribución adiposo-muscular">
          <div className="grid gap-6 sm:grid-cols-2">
            {(
              [
                {
                  title: "Adiposa",
                  items: [
                    ["Superior", current.distribution.adipose.upper],
                    ["Central", current.distribution.adipose.central],
                    ["Inferior", current.distribution.adipose.lower],
                  ],
                },
                {
                  title: "Muscular",
                  items: [
                    ["Brazo", current.distribution.muscle.arm],
                    ["Muslo", current.distribution.muscle.thigh],
                    ["Pierna", current.distribution.muscle.calf],
                  ],
                },
              ] as const
            ).map((list) => (
              <div key={list.title}>
                <h3 className="mb-2 text-sm font-semibold">{list.title}</h3>
                <dl className="divide-y text-sm">
                  {list.items.map(([label, value]) => (
                    <Row key={label} label={label}>
                      <IsakValueText value={value} decimals={2} unit="%" />
                    </Row>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Card>

        {/* 4. Índices de composición corporal (no en menores, D13) */}
        {minor ? null : (
          <Card title="Índices de composición corporal">
            <dl className="divide-y text-sm">
              <Row label="Índice adiposo muscular">
                <IsakValueText value={current.compositionIndices.adiposeMuscle} decimals={2} />
                <PrevNote
                  current={current.compositionIndices.adiposeMuscle}
                  previous={previous?.compositionIndices.adiposeMuscle}
                  decimals={2}
                />
                <span className="basis-full text-xs text-muted-foreground">{ISAK_TEXT.adiposeMuscleHint}</span>
              </Row>
              <Row label="Índice músculo/óseo">
                <IsakValueText value={classifiedValue(imo)} decimals={2} />
                {imo.status === "ok" ? <Badge tone={MUSCLE_BONE_TONES[imo.classKey]}>{imo.classLabel}</Badge> : null}
                <PrevNote current={classifiedValue(imo)} previous={prevImo} decimals={2} />
              </Row>
            </dl>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver tabla de categorías</summary>
              <Table containerClassName="mt-2 max-w-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Rango</TableHead>
                    <TableHead>Categoría</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MUSCLE_BONE_TABLE.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="tabular-nums">{r.range}</TableCell>
                      <TableCell>{MUSCLE_BONE_CLASS_LABELS[r.key]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </details>
          </Card>
        )}

        {/* 5. Adiposidad y muscularidad */}
        <Card title="Adiposidad y muscularidad">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Indicador</TableHead>
                <TableHead numeric>Valor</TableHead>
                <TableHead numeric>Z</TableHead>
                {withPrev ? (
                  <>
                    <TableHead numeric>Anterior</TableHead>
                    <TableHead numeric>Dif.</TableHead>
                  </>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {indicatorRows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell numeric>
                    <IsakValueText value={r.value} decimals={r.decimals} unit={r.unit} />
                  </TableCell>
                  <TableCell numeric>
                    {r.z ? <IsakValueText value={r.z} decimals={2} /> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  {withPrev ? <PreviousCells current={r.value} previous={r.prev} decimals={r.decimals} unit={r.unit} /> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* 6. Proporcionalidad */}
        <Card title="Proporcionalidad">
          <dl className="divide-y text-sm">
            {proportionality.map((p) => (
              <Row key={p.label} label={p.label}>
                <IsakValueText value={classifiedValue(p.row)} decimals={p.decimals} />
                {p.row.status === "ok" ? <Muted>{p.row.classLabel}</Muted> : null}
                <PrevNote
                  current={classifiedValue(p.row)}
                  previous={p.prev ? classifiedValue(p.prev) : undefined}
                  decimals={p.decimals}
                />
              </Row>
            ))}
          </dl>
        </Card>

        {/* 7. Somatotipo */}
        <Card title="Somatotipo">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["Endomorfia", somato.endo, prevSomato?.endo],
                ["Mesomorfia", somato.meso, prevSomato?.meso],
                ["Ectomorfia", somato.ecto, prevSomato?.ecto],
              ] as const
            ).map(([label, value, prev]) => (
              <StatTile key={label} label={label} value={value.status === "ok" ? formatFixedEs(value.value, 2) : undefined}>
                {value.status === "missing" ? <p className="mt-1 text-xs text-muted-foreground">{value.note}</p> : null}
                {prev && previousNote(value, prev, 2) ? (
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">{previousNote(value, prev, 2)}</p>
                ) : null}
              </StatTile>
            ))}
          </div>
          <p className="mt-4 font-medium">
            {somato.category.status === "ok" ? (
              somato.category.label
            ) : (
              <span className="text-sm font-normal text-muted-foreground">{somato.category.note}</span>
            )}
          </p>
          <div className="mt-4">
            <Somatochart
              current={somato.chart.status === "ok" ? { x: somato.chart.x, y: somato.chart.y, label: somatoLabel(somato) } : null}
              previous={
                prevSomato && prevSomato.chart.status === "ok"
                  ? { x: prevSomato.chart.x, y: prevSomato.chart.y, label: somatoLabel(prevSomato) }
                  : null
              }
              missingNote={somato.chart.status === "missing" ? somato.chart.note : undefined}
            />
          </div>
        </Card>

        {/* 8. Índices de salud (reusa las filas del diagnóstico de la HU-004) */}
        <Card title="Índices de salud">
          <dl className="divide-y text-sm">
            {health.ageGroup === "PEDIATRIC" && health.pediatric ? (
              <>
                <GrowthIndicatorRow
                  label={PEDIATRIC_TEXT.bmiForAgeLabel}
                  row={health.pediatric.bmiForAge}
                  tones={BMI_FOR_AGE_TONES}
                  decimals={1}
                  reference={PEDIATRIC_TEXT.bmiForAgeReference}
                  source={null}
                />
                <GrowthIndicatorRow
                  label={PEDIATRIC_TEXT.heightForAgeLabel}
                  row={health.pediatric.heightForAge}
                  tones={HEIGHT_FOR_AGE_TONES}
                  unit="cm"
                  decimals={1}
                  reference={PEDIATRIC_TEXT.heightForAgeReference}
                  source={null}
                />
              </>
            ) : (
              <IndicatorRow
                label="IMC"
                row={health.bmi}
                tones={BMI_TONES}
                decimals={1}
                reference={minor ? null : BMI_HEALTHY_RANGE_TEXT}
                source={null}
              />
            )}
            {health.waistHipRatio ? (
              <IndicatorRow
                label="Índice cintura/cadera"
                row={health.waistHipRatio}
                tones={WAIST_HIP_TONES}
                decimals={2}
                reference={health.waistHipRatio.thresholdText}
                source={null}
              />
            ) : null}
            {health.waistToHeight ? (
              <IndicatorRow
                label="Cintura/talla"
                row={health.waistToHeight}
                tones={HEALTHY_TONES}
                decimals={2}
                reference="<0,50"
                source={null}
              />
            ) : null}
            {health.conicity ? (
              <IndicatorRow
                label="Índice de conicidad"
                row={health.conicity}
                tones={HEALTHY_TONES}
                decimals={2}
                reference="<1,4"
                source={null}
              />
            ) : null}
            <Row label="Índice de distribución grasa">
              <IsakValueText value={current.health.fatDistributionIndex} decimals={2} />
              <PrevNote
                current={current.health.fatDistributionIndex}
                previous={previous?.health.fatDistributionIndex}
                decimals={2}
              />
              <span className="basis-full text-xs text-muted-foreground">{ISAK_TEXT.fatDistributionHint}</span>
            </Row>
          </dl>
        </Card>

        <p className="text-xs text-muted-foreground">{ISAK_TEXT.methods}</p>
      </div>
    </div>
  );
}
