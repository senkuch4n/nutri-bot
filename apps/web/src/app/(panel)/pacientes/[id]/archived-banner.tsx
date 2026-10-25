"use client";

import { Archive } from "lucide-react";
import { PATIENT_ARCHIVE_TEXT } from "@nutri-bot/core";
import { Button } from "@/components/ui";
import { useUnarchivePatient } from "./patient-archive-controls";

/** HU-019 (SDD 7.2): aviso neutro arriba del encabezado de una paciente archivada. No es un error
 *  (no se perdió nada): tono gris del sistema, no rojo. La ficha sigue editable (D9). */
export function ArchivedBanner({ patientId, archivedLabel }: { patientId: string; archivedLabel: string }) {
  const { unarchive, pending } = useUnarchivePatient(patientId);
  return (
    <div
      role="note"
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-card px-4 py-3 shadow-card more-contrast:border more-contrast:border-input"
    >
      <Archive className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <p className="min-w-0 flex-1 text-pretty text-callout text-foreground">
        {PATIENT_ARCHIVE_TEXT.banner(archivedLabel)}
      </p>
      <Button variant="secondary" loading={pending} onClick={() => void unarchive()} className="shrink-0">
        {PATIENT_ARCHIVE_TEXT.unarchiveButton}
      </Button>
    </div>
  );
}
