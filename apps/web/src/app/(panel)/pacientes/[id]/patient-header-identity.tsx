import type { ReactNode } from "react";
import type { PatientStage } from "@nutri-bot/core";
import { PATIENT_ARCHIVE_TEXT, PATIENT_SUMMARY_TEXT } from "@nutri-bot/core";
import { MorphDialogTitle } from "@/components/primitives/morph-dialog";
import { cn } from "@/lib/utils";
import { PatientAvatar, StageBadge } from "../patient-card";

const T = PATIENT_SUMMARY_TEXT;

const titleClass = (name: string | null) =>
  cn("min-w-0 truncate text-title-1 font-medium", name ? "text-foreground" : "text-muted-foreground");

/** Avatar, etapa y nombre del encabezado de la ficha. Lo usan el encabezado y el que se muestra mientras
 *  carga el modal (con lo que ya sabía la fila): los dos quedan en el mismo lugar. Las iniciales, el
 *  nombre y la etapa son elementos compartidos del MorphDialog (`morphId`/`data-morph-id`). */
export function PatientHeaderIdentity({
  initials,
  stage,
  archived,
  name,
  inDialog,
  nameAside,
}: {
  initials: string;
  stage: PatientStage | null;
  archived: boolean;
  name: string | null;
  /** Dentro del modal de la lista: el nombre es el título del diálogo (Radix lo pide). */
  inDialog: boolean;
  /** Al lado del nombre (p. ej. el botón para cargarlo). */
  nameAside?: ReactNode;
}) {
  return (
    <>
      {/* En el modal, la etapa deja lugar a la X de cerrar (arriba a la derecha). */}
      <div className={cn("flex items-start justify-between gap-3", inDialog && "pr-7")}>
        <PatientAvatar
          initials={initials || "?"}
          morphId="avatar"
          className="size-16 text-title-2 sm:size-20 sm:text-title-1"
        />
        {archived ? (
          <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-footnote font-medium text-muted-foreground">
            {PATIENT_ARCHIVE_TEXT.archivedBadge}
          </span>
        ) : stage ? (
          <StageBadge stage={stage} morphId="stage" />
        ) : null}
      </div>

      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {inDialog ? (
          <MorphDialogTitle asChild className={titleClass(name)}>
            <h1 data-morph-id="name">{name ?? T.unnamed}</h1>
          </MorphDialogTitle>
        ) : (
          <h1 data-morph-id="name" className={titleClass(name)}>
            {name ?? T.unnamed}
          </h1>
        )}
        {nameAside}
      </div>
    </>
  );
}
