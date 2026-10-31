"use client";

import type { MouseEvent } from "react";
import { PATIENT_DIRECTORY_TEXT, type PatientDirectoryRow, type PatientStage } from "@nutri-bot/core";
import { cn } from "@/lib/utils";

const T = PATIENT_DIRECTORY_TEXT;

export type PatientView = "list" | "grid";

/** `morphId`: elemento compartido del MorphDialog (viaja entre la fila y el encabezado de la ficha). */
export function PatientAvatar({ initials, className, morphId }: { initials: string; className?: string; morphId?: string }) {
  return (
    <span
      aria-hidden
      data-morph-id={morphId}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-caption font-semibold tracking-wide text-muted-foreground",
        className,
      )}
    >
      {initials}
    </span>
  );
}

const stageTones: Record<PatientStage, string> = {
  in_progress: "bg-success-muted text-success",
  dropped: "bg-secondary text-muted-foreground",
};

export function StageBadge({ stage, morphId }: { stage: PatientStage; morphId?: string }) {
  return (
    <span
      data-morph-id={morphId}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-footnote font-medium",
        stageTones[stage],
      )}
    >
      {T.stage[stage]}
    </span>
  );
}

/** Tarjeta de un paciente en la lista (fila ancha) o en la cuadrícula. Abre el resumen con un toque;
 *  el botón es el origen del MorphDialog. */
export function PatientCard({
  row,
  view,
  onOpen,
  onIntent,
}: {
  row: PatientDirectoryRow;
  view: PatientView;
  onOpen: (row: PatientDirectoryRow, origin: HTMLElement) => void;
  /** Al apuntar o enfocar: la ficha se precarga y el modal abre sin esperar al servidor. */
  onIntent?: (row: PatientDirectoryRow) => void;
}) {
  const grid = view === "grid";
  return (
    <li>
      <button
        type="button"
        onClick={(e: MouseEvent<HTMLButtonElement>) => onOpen(row, e.currentTarget)}
        onPointerEnter={onIntent ? () => onIntent(row) : undefined}
        onFocus={onIntent ? () => onIntent(row) : undefined}
        className={cn(
          "flex w-full gap-4 rounded-2xl border border-border/70 bg-card text-left shadow-card press-none",
          "transition-colors duration-hover hover:bg-overlay-hover pressed:bg-overlay-pressed",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          grid ? "h-full flex-col px-5 py-5" : "min-h-16 items-center px-5 py-4 sm:px-6",
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-4", !grid && "flex-1")}>
          <PatientAvatar initials={row.initials} morphId="avatar" />
          <span className="min-w-0">
            <span data-morph-id="name" className="block truncate text-headline text-foreground">
              {row.name}
            </span>
            <span className="mt-0.5 block truncate text-footnote text-muted-foreground">
              {row.statusLine}
              {row.phoneLabel ? (
                <>
                  {" · "}
                  <span className="whitespace-nowrap tabular-nums">{row.phoneLabel}</span>
                </>
              ) : null}
            </span>
          </span>
        </span>
        <span className={cn("shrink-0", grid && "mt-auto")}>
          <StageBadge stage={row.stage} morphId="stage" />
        </span>
      </button>
    </li>
  );
}
