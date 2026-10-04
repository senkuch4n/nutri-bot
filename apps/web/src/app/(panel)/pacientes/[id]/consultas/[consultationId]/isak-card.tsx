"use client";

import { useState } from "react";
import { FileText, Pencil, Plus } from "lucide-react";
import { ISAK_REPORT_TEXT, ISAK_TEXT, type IsakMeasures, type buildIsakSummary } from "@nutri-bot/core";
import { Badge, Button, ButtonLink, Card } from "@/components/ui";
import { usePendingDeletion } from "@/lib/deferred-delete";
import { IsakStudyMoreMenu } from "./delete-isak-study-button";
import { MUSCLE_BONE_TONES } from "./diagnosis-rows";
import { IsakForm } from "./isak-form";

/** Tarjeta "Antropometría ISAK" del detalle de la consulta (HU-006): vacío, formulario o resumen. */
export function IsakCard({
  patientId,
  consultationId,
  study,
  prefill,
  startEditing,
}: {
  patientId: string;
  consultationId: string;
  study: null | {
    entryId: string;
    /** Para precargar el formulario al editar. */
    values: IsakMeasures;
    summary: ReturnType<typeof buildIsakSummary>;
    /** HU-007: informe del estudio. generatedAtLabel = fecha del último PDF (null si no hay). */
    report: { generatedAtLabel: string | null; exists: boolean };
  };
  prefill: { weightKg: number | null; heightCm: number | null };
  startEditing: boolean;
}) {
  const [mode, setMode] = useState<"view" | "form">(startEditing && study ? "form" : "view");
  // HU-017c-3: mientras corre el plazo de "Deshacer", el estudio se ve como borrado.
  const deleting = usePendingDeletion(study ? `isak:${study.entryId}` : "isak:");
  const summary = study && !deleting ? study.summary : undefined;
  const nothingToShow = summary && !summary.tissuesLine && !summary.somatotypeLine && !summary.sum6Line;

  return (
    <div id="antropometria-isak" className="scroll-mt-6">
      <Card title={ISAK_TEXT.cardTitle}>
        {mode === "form" ? (
          <IsakForm
            // Sin key: al pasar de "view" a "form" se monta de cero (los defaultValue se toman de
            // nuevo), y una key atada a entryId remontaba el form al guardar el alta y perdía el
            // state.ok de useActionState (no cerraba ni mostraba el toast).
            patientId={patientId}
            consultationId={consultationId}
            entryId={study?.entryId ?? null}
            initial={study ? study.values : { weightKg: prefill.weightKg, heightCm: prefill.heightCm }}
            onDone={() => setMode("view")}
          />
        ) : study && summary && !deleting ? (
          <div className="space-y-4">
            <div className="space-y-2 text-body tabular-nums">
              {summary.tissuesLine ? <p>{summary.tissuesLine}</p> : null}
              {summary.somatotypeLine ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{summary.somatotypeLine}</span>
                  {summary.muscleBone ? (
                    <Badge tone={MUSCLE_BONE_TONES[summary.muscleBone.key]}>{summary.muscleBone.label}</Badge>
                  ) : null}
                </p>
              ) : null}
              {summary.sum6Line ? <p>{summary.sum6Line}</p> : null}
              {nothingToShow ? (
                <p className="text-muted-foreground">Estudio cargado. Faltan medidas para los cálculos.</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink href={`/pacientes/${patientId}/consultas/${consultationId}/antropometria`} size="lg" className="max-sm:w-full">
                {ISAK_TEXT.viewFull}
              </ButtonLink>
              <ButtonLink
                href={`/pacientes/${patientId}/consultas/${consultationId}/antropometria/informe`}
                variant="secondary"
                size="lg"
              >
                <FileText aria-hidden />
                Informe
              </ButtonLink>
              <Button type="button" variant="secondary" size="lg" onClick={() => setMode("form")}>
                <Pencil aria-hidden />
                Editar
              </Button>
              <IsakStudyMoreMenu
                patientId={patientId}
                consultationId={consultationId}
                entryId={study.entryId}
                hasReport={study.report.exists}
              />
            </div>
            {study.report.generatedAtLabel ? (
              <p className="text-xs text-muted-foreground">{ISAK_REPORT_TEXT.cardGenerated(study.report.generatedAtLabel)}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-body text-muted-foreground">{ISAK_TEXT.empty}</p>
            {/* Mientras corre el "Deshacer" el estudio todavía existe: cargar otro chocaría con él. */}
            <Button
              type="button"
              size="lg"
              disabled={deleting}
              aria-describedby={deleting ? `${consultationId}-isak-espera` : undefined}
              onClick={() => setMode("form")}
            >
              <Plus aria-hidden />
              {ISAK_TEXT.load}
            </Button>
            {deleting ? (
              <p id={`${consultationId}-isak-espera`} className="text-footnote text-muted-foreground">
                Vas a poder cargar otro cuando se cierre el aviso de “Deshacer”.
              </p>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
