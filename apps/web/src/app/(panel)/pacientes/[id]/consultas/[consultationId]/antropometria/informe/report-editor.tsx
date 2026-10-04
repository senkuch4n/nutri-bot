"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, Download, FileText, RotateCcw, Save, Send } from "lucide-react";
import {
  ISAK_REPORT_TEXT,
  ISAK_REPORT_TEXT_KEYS,
  ISAK_TEXT,
  formatFixedEs,
  type IsakReportModel,
  type IsakReportRow,
  type IsakReportTextKey,
  type IsakReportTexts,
} from "@nutri-bot/core";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/primitives/table";
import { useConfirm } from "@/components/confirm";
import { Alert, Badge, Button, ButtonLink, Card, FormError, Textarea, cn } from "@/components/ui";
import { notify } from "@/lib/notify";
import { REPORT_EDITOR_TEXT as E, isEditedText, reportIssues, sendConfirmCopy } from "@/lib/report-editor-text";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import {
  generateIsakReportPdfAction,
  saveIsakReportTextsAction,
  sendIsakReportWhatsAppAction,
  type ReportActionState,
} from "../../../../report-actions";

type Running = "save" | "generate" | "send" | null;

const T = ISAK_REPORT_TEXT;

// ─── Tabla Anterior / Actual / Dif. ──────────────────────────────────────────

function ValueCell({ value }: { value: string | null }) {
  return (
    <TableCell numeric className={cn(value === T.noData && "text-muted-foreground")}>
      {value ?? "—"}
    </TableCell>
  );
}

function ReportRowsTable({
  model,
  rows,
  strongKeys = [],
  label = "Medida",
}: {
  model: IsakReportModel;
  rows: IsakReportRow[];
  strongKeys?: string[];
  label?: string;
}) {
  const withPrev = model.hasPrevious;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{label}</TableHead>
          {withPrev ? <TableHead numeric>{model.legend.previous}</TableHead> : null}
          <TableHead numeric>{model.legend.current}</TableHead>
          {withPrev ? <TableHead numeric>Dif.</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key} className={cn(strongKeys.includes(r.key) && "font-semibold")}>
            <TableCell>{r.label}</TableCell>
            {withPrev ? <ValueCell value={r.previous} /> : null}
            <ValueCell value={r.current} />
            {withPrev ? <ValueCell value={r.diff} /> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Intro({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-sm text-muted-foreground">{children}</p>;
}

function SubTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 mt-5 text-sm font-semibold">{children}</h3>;
}

// ─── Campo de texto con borrador ─────────────────────────────────────────────

function ReportTextField({
  textKey,
  value,
  draft,
  onChange,
  onReset,
  error,
  required,
  disabled,
  textareaRef,
}: {
  textKey: IsakReportTextKey;
  value: string;
  draft: string;
  onChange: (value: string) => void;
  onReset: () => void;
  error?: string;
  required?: boolean;
  disabled: boolean;
  textareaRef?: React.Ref<HTMLTextAreaElement>;
}) {
  const id = `informe-${textKey}`;
  const errorId = `${id}-error`;
  const edited = isEditedText(value, draft);
  return (
    <div className="mt-5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {T.textLabels[textKey]}
          {required ? (
            <>
              <span aria-hidden className="text-destructive">
                {" "}*
              </span>
              <span className="sr-only"> (obligatorio)</span>
            </>
          ) : null}
        </label>
        {/* HU-017c-4: la marca aparece solo en los campos tocados, junto a "Restaurar el texto original". */}
        {edited ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="whitespace-nowrap">
              <Badge>{E.edited}</Badge>
            </span>
            <Button type="button" variant="plain" size="sm" className="h-8 px-0" onClick={onReset} disabled={disabled}>
              <RotateCcw aria-hidden />
              {E.restore}
            </Button>
          </div>
        ) : null}
      </div>
      <Textarea
        id={id}
        ref={textareaRef}
        rows={textKey === "conclusions" ? 8 : 4}
        // En el celular la barra de acciones queda pegada abajo: que no tape el campo con foco.
        className="max-sm:scroll-mb-48"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-required={required || undefined}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ─── Editor ─────────────────────────────────────────────────────────────────

export function ReportEditor({
  patientId,
  consultationId,
  model,
  drafts,
  initialTexts,
  patientName,
  whatsappJid,
  phone,
  hasPdf,
  lastPdfLabel,
  stale,
  licenseMissing,
  signatureMissing,
  reportHref,
  studyHref,
  editStudyHref,
}: {
  patientId: string;
  consultationId: string;
  model: IsakReportModel;
  drafts: IsakReportTexts;
  initialTexts: IsakReportTexts;
  patientName: string | null;
  whatsappJid: string;
  phone: string;
  hasPdf: boolean;
  lastPdfLabel: string | null;
  stale: boolean;
  /** HU-016 (D8): datos de la profesional que faltan en el PDF. */
  licenseMissing: boolean;
  signatureMissing: boolean;
  reportHref: string;
  studyHref: string;
  editStudyHref: string;
}) {
  const confirm = useConfirm();
  const [texts, setTexts] = useState<IsakReportTexts>(initialTexts);
  const [saved, setSaved] = useState<IsakReportTexts>(initialTexts);
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<Running>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<IsakReportTextKey, string>>>({});
  const conclusionsRef = useRef<HTMLTextAreaElement>(null);

  const dirty = ISAK_REPORT_TEXT_KEYS.some((k) => texts[k] !== saved[k]);
  const { guardNavigation } = useUnsavedChangesGuard(dirty, {
    title: T.discardTitle,
    description: T.discardDescription,
    confirmLabel: T.discardLabel,
  });
  const busy = pending || running !== null;

  const setText = (key: IsakReportTextKey, value: string) => {
    setTexts((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // confirm siempre acá, en el handler, antes de cualquier transición.
  async function resetDraft(key: IsakReportTextKey) {
    const ok = await confirm({
      title: E.restoreTitle,
      description: T.resetDraftDescription,
      confirmLabel: E.restoreConfirm,
    });
    if (ok) setText(key, drafts[key]);
  }

  function run(kind: Exclude<Running, null>, action: typeof saveIsakReportTextsAction, onSuccess: () => void) {
    const snapshot = texts;
    setError(null);
    setFieldErrors({});
    setRunning(kind);
    startTransition(async () => {
      let res: ReportActionState;
      try {
        res = await action({ patientId, consultationId, texts: snapshot });
      } catch {
        res = { ok: false, error: kind === "save" ? T.saveError : kind === "generate" ? T.generateError : T.sendError };
      }
      if (res.ok) {
        setSaved(snapshot);
        onSuccess();
      } else {
        if (res.fieldErrors) {
          setFieldErrors(res.fieldErrors);
          if (res.fieldErrors.conclusions) conclusionsRef.current?.focus();
        }
        if (res.error) setError(res.error);
      }
      setRunning(null);
    });
  }

  const save = () => run("save", saveIsakReportTextsAction, () => notify.saved(T.textsSaved));
  const generate = () => run("generate", generateIsakReportPdfAction, () => notify.saved(T.generated));
  const sendCopy = sendConfirmCopy({ patientName, whatsappJid, phone });
  async function send() {
    const ok = await confirm({
      title: sendCopy.title,
      description: sendCopy.description,
      confirmLabel: E.sendConfirm,
      destructive: false,
    });
    if (!ok) return;
    run("send", sendIsakReportWhatsAppAction, () => notify.info(T.queued(sendCopy.recipient)));
  }

  const issues = reportIssues({ stale, hasMissingData: model.hasMissingData, licenseMissing, signatureMissing });
  const issueAction = (key: (typeof issues)[number]["key"]) => {
    if (key === "stale") {
      return (
        <Button type="button" variant="secondary" size="sm" disabled={busy} loading={running === "generate"} onClick={generate}>
          {E.regenerate}
        </Button>
      );
    }
    // Enlaces comunes: el guard de cambios sin guardar intercepta los clics en <a>.
    return (
      <ButtonLink href={key === "missingData" ? editStudyHref : "/ajustes?tab=pdf"} variant="secondary" size="sm">
        {key === "missingData" ? E.completeStudy : E.goToSettings}
      </ButtonLink>
    );
  };

  const field = (key: IsakReportTextKey) => (
    <ReportTextField
      textKey={key}
      value={texts[key]}
      draft={drafts[key]}
      onChange={(v) => setText(key, v)}
      onReset={() => void resetDraft(key)}
      error={fieldErrors[key]}
      required={key === "conclusions"}
      disabled={busy}
      textareaRef={key === "conclusions" ? conclusionsRef : undefined}
    />
  );

  return (
    <div>
      {/* Mismas clases que el `back` de PageHeader, pero pasando por el guard de cambios sin guardar. */}
      <a
        href={studyHref}
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          e.stopPropagation();
          void guardNavigation(studyHref);
        }}
        className="mb-3 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {T.backToStudy}
      </a>
      {/* Como PageHeader, con la ayuda como texto secundario bajo el subtítulo (HU §4.5). */}
      <div className="mb-8">
        <h1 className="text-balance text-title-1">{T.pageTitle}</h1>
        <p className="mt-1.5 text-body text-muted-foreground">{model.subtitle}</p>
        <p className="mt-1 text-footnote text-muted-foreground">{E.help}</p>
      </div>

      <div className="space-y-6">
        {issues.length > 0 || model.minor ? (
          <div className="space-y-3">
            {issues.length > 0 ? (
              <Alert tone="warning" title={E.issuesTitle}>
                <ul className="divide-y divide-warning/20">
                  {issues.map((issue) => (
                    <li
                      key={issue.key}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 first:pt-0 last:pb-0"
                    >
                      <span className="min-w-0 flex-1 basis-60">{issue.text}</span>
                      {issueAction(issue.key)}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {model.minor ? <Alert tone="info">{ISAK_TEXT.minorWarning}</Alert> : null}
          </div>
        ) : null}

        {/* 1. Datos personales */}
        <Card title={T.sections.personal}>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {(
              [
                [T.personalName, model.personal.name],
                [T.personalAge, model.personal.age],
                [T.personalDate, model.personal.date],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* 2. Mediciones */}
        <Card title={T.sections.measurements}>
          <ReportRowsTable model={model} rows={[
              ...model.measurements.rows,
              model.measurements.bmi,
              ...(model.measurements.heightForAge ? [model.measurements.heightForAge] : []),
            ]} />
        </Card>

        {/* 3. Pliegues */}
        <Card title={T.sections.skinfolds}>
          <Intro>{model.skinfolds.intro}</Intro>
          <ReportRowsTable
            model={model}
            rows={[...model.skinfolds.rows, model.skinfolds.sum6]}
            strongKeys={[model.skinfolds.sum6.key]}
            label="Pliegue"
          />
          <SubTitle>{model.skinfolds.othersTitle}</SubTitle>
          <ReportRowsTable model={model} rows={model.skinfolds.others} label="Pliegue" />
        </Card>

        {/* 4. Perímetros */}
        <Card title={T.sections.girths}>
          <Intro>{model.girths.muscleIntro}</Intro>
          <ReportRowsTable model={model} rows={model.girths.muscle} label="Perímetro" />
          <div className="mt-5">
            <Intro>{model.girths.visceralIntro}</Intro>
          </div>
          <ReportRowsTable model={model} rows={model.girths.visceral} label="Perímetro" />
          <div className="mt-5">
            <Intro>{model.girths.correctedIntro}</Intro>
          </div>
          <ReportRowsTable model={model} rows={model.girths.corrected} label="Perímetro corregido" />
          {field("girths")}
        </Card>

        {/* 5. Distribución */}
        <Card title={T.sections.distribution}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Perímetro</TableHead>
                {model.hasPrevious ? <TableHead numeric>{model.legend.previous}</TableHead> : null}
                <TableHead numeric>{model.legend.current}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.distribution.bars.map((b) => {
                const fmt = (v: number | null) => (v === null ? T.noData : `${formatFixedEs(v, b.decimals)} cm`);
                return (
                  <TableRow key={b.key}>
                    <TableCell>{b.label}</TableCell>
                    {model.hasPrevious ? <ValueCell value={fmt(b.previous)} /> : null}
                    <ValueCell value={fmt(b.current)} />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            {(
              [
                [T.adiposeTissue, model.distribution.adipose],
                [T.muscleTissue, model.distribution.muscle],
              ] as const
            ).map(([title, items]) => (
              <div key={title}>
                <h3 className="mb-2 text-sm font-semibold">{title}</h3>
                <dl className="divide-y text-sm">
                  {items.map((i) => (
                    <div key={i.key} className="flex justify-between gap-4 py-2">
                      <dt className="text-muted-foreground">{i.label}</dt>
                      <dd className={cn("tabular-nums", i.value === T.noData && "text-muted-foreground")}>{i.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          {field("distribution")}
        </Card>

        {/* 6. Indicadores de salud */}
        <Card title={T.sections.health}>
          <div className="divide-y">
            {model.health.indicators.map((ind) => (
              <div key={ind.key} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium">{ind.label}</span>
                  <span className={cn("tabular-nums", ind.value === T.noData && "text-muted-foreground")}>{ind.value}</span>
                  {ind.category ? (
                    <span className="whitespace-nowrap">
                      <Badge>{ind.category}</Badge>
                    </span>
                  ) : null}
                </div>
                {ind.variation ? <p className="mt-1 text-xs tabular-nums text-muted-foreground">{ind.variation}</p> : null}
                {field(ind.textKey)}
              </div>
            ))}
          </div>
        </Card>

        {/* 7. Composición corporal */}
        {model.composition ? (
          <Card title={T.sections.composition}>
            <Intro>{model.composition.intro}</Intro>
            <p className="mb-3 text-xs text-muted-foreground">{model.composition.methods}</p>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Componente</TableHead>
                  {model.hasPrevious ? <TableHead numeric>Anterior</TableHead> : null}
                  <TableHead numeric>Actual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {model.composition.rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell>{r.label}</TableCell>
                    {model.hasPrevious ? <ValueCell value={r.previous} /> : null}
                    <ValueCell value={r.current} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : null}

        {/* 8. Somatotipo */}
        <Card title={T.sections.somatotype}>
          <Intro>{model.somatotype.intro}</Intro>
          <p className="text-sm tabular-nums">{model.somatotype.components}</p>
          <p className="mt-1 text-sm font-medium">{model.somatotype.category}</p>
          {model.somatotype.chart.missingNote ? (
            <p className="mt-1 text-sm text-muted-foreground">{model.somatotype.chart.missingNote}</p>
          ) : null}
          {field("somatotype")}
        </Card>

        {/* 9. Conclusiones */}
        <Card title={T.sections.conclusions}>{field("conclusions")}</Card>

        {/* Acciones (HU §4.5): "Generar PDF" es la principal. En el celular, barra pegada abajo. */}
        <div
          role="group"
          aria-label="Acciones del informe"
          className={cn(
            "max-sm:material-bar max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-6 max-sm:border-t max-sm:px-6 max-sm:pt-3",
            "max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
            "sm:rounded-xl sm:bg-card sm:p-6 sm:shadow-card sm:more-contrast:border sm:more-contrast:border-input",
          )}
        >
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button type="button" size="lg" disabled={busy} loading={running === "generate"} onClick={generate}>
              {running === "generate" ? null : <FileText aria-hidden />}
              {running === "generate" ? T.generating : T.generate}
            </Button>
            <Button type="button" variant="secondary" size="lg" disabled={busy} loading={running === "save"} onClick={save}>
              {running === "save" ? null : <Save aria-hidden />}
              {running === "save" ? T.savingTexts : T.saveTexts}
            </Button>
            {hasPdf ? (
              <ButtonLink
                href={`${reportHref}/pdf`}
                target="_blank"
                rel="noopener"
                prefetch={false}
                variant="secondary"
                size="lg"
              >
                <Download aria-hidden />
                {T.download}
              </ButtonLink>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className={cn(!hasPdf && "max-sm:col-span-2")}
              disabled={busy}
              loading={running === "send"}
              onClick={() => void send()}
            >
              {running === "send" ? null : <Send aria-hidden />}
              {running === "send" ? (
                T.sending
              ) : (
                <span>
                  Enviar<span className="max-sm:sr-only"> por WhatsApp</span>
                </span>
              )}
            </Button>
          </div>
          <p className="mt-2 text-footnote text-muted-foreground sm:mt-3" aria-live="polite">
            {hasPdf && lastPdfLabel ? T.lastPdf(lastPdfLabel) : T.noPdf}
          </p>
          <FormError message={error} />
        </div>
      </div>
    </div>
  );
}
