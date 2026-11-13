"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, m, useIsPresent } from "motion/react";
import { ImageOff, Trash2 } from "lucide-react";
import { PORTAL_DIARY_TEXT as T } from "@nutri-bot/core";
import { deleteDiaryEntryAction } from "@/app/(portal)/portal/diario/actions";
import { Button } from "@/components/ui";
import { useDeferredDelete, usePendingDeletions } from "@/lib/deferred-delete";
import { springs } from "@/lib/motion";
import { DiaryPhotoSheet } from "./diary-photo-sheet";
import type { DiaryEntryRow, DiaryGroupRow } from "./diary-screen";

// HU-017d-2 (SDD 4.5): registros agrupados por día. Al cargar nada se anima; lo nuevo (llega con la
// revalidación) entra con una transición y lo borrado se funde. Con movimiento reducido, solo el
// fundido (MotionConfig reducedMotion="user" del layout raíz).

export const DIARY_TITLE_ID = "portal-diary-title";

export function diaryDeletionKey(id: string): string {
  return `diary:${id}`;
}

/** Los grupos sin las entradas pendientes de borrar; los que quedan vacíos no van. */
export function visibleDiaryGroups(groups: readonly DiaryGroupRow[], pending: ReadonlySet<string>): DiaryGroupRow[] {
  return groups
    .map((g) => ({ ...g, entries: g.entries.filter((e) => !pending.has(diaryDeletionKey(e.id))) }))
    .filter((g) => g.entries.length > 0);
}

const enter = { opacity: 0, y: -8 };
const shown = { opacity: 1, y: 0 };

export function DiaryList({ groups }: { groups: DiaryGroupRow[] }) {
  const pending = usePendingDeletions();
  const deferredDelete = useDeferredDelete();
  const [photo, setPhoto] = useState<{ id: string; title: string } | null>(null);
  const visible = visibleDiaryGroups(groups, pending);

  function remove(entry: DiaryEntryRow) {
    const scheduled = deferredDelete({
      key: diaryDeletionKey(entry.id),
      message: T.deleted,
      undoneMessage: T.undone,
      commit: () => deleteDiaryEntryAction(entry.id),
      guardUnload: true,
      errorMessage: T.deleteError,
    });
    // Ya estaba pendiente (doble toque): no se hace nada (T9d).
    if (!scheduled) return;
    // La fila desaparece: el foco pasa al título de la página.
    document.getElementById(DIARY_TITLE_ID)?.focus();
  }

  return (
    <>
      <div className="space-y-6">
        <AnimatePresence initial={false}>
          {visible.map((group) => (
            <DiaryGroupSection key={group.dayKey} labelledBy={`diario-dia-${group.dayKey}`}>
              <h2
                id={`diario-dia-${group.dayKey}`}
                className="mb-2 px-4 text-subheadline font-semibold text-muted-foreground"
              >
                {group.label}
              </h2>
              <ul className="overflow-hidden rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input">
                <AnimatePresence initial={false}>
                  {group.entries.map((entry) => (
                    <DiaryListItem key={entry.id}>
                      <DiaryEntryItem
                        entry={entry}
                        onDelete={() => remove(entry)}
                        onOpenPhoto={() => setPhoto({ id: entry.id, title: `${group.label}, ${entry.timeLabel}` })}
                      />
                    </DiaryListItem>
                  ))}
                </AnimatePresence>
              </ul>
            </DiaryGroupSection>
          ))}
        </AnimatePresence>
      </div>
      <DiaryPhotoSheet
        entryId={photo?.id ?? null}
        title={photo?.title ?? ""}
        onOpenChange={(open) => {
          if (!open) setPhoto(null);
        }}
      />
    </>
  );
}

/** Grupo de un día. Igual que la fila: entra con la transición y, al quedar vacío, se funde inerte. */
function DiaryGroupSection({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  const isPresent = useIsPresent();
  return (
    <m.section
      layout="position"
      aria-labelledby={labelledBy}
      initial={enter}
      animate={shown}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={springs.standard}
      inert={!isPresent || undefined}
    >
      {children}
    </m.section>
  );
}

/** Fila animada. Mientras se funde al borrarla queda `inert`: un segundo toque no le llega ni le roba
 *  el foco al título (el doble toque en "Borrar"). */
function DiaryListItem({ children }: { children: ReactNode }) {
  const isPresent = useIsPresent();
  return (
    <m.li
      layout="position"
      initial={enter}
      animate={shown}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={springs.standard}
      inert={!isPresent || undefined}
      className="border-b border-border px-4 py-3 last:border-b-0"
    >
      {children}
    </m.li>
  );
}

function DiaryEntryItem({
  entry,
  onDelete,
  onOpenPhoto,
}: {
  entry: DiaryEntryRow;
  onDelete: () => void;
  onOpenPhoto: () => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-subheadline tabular-nums text-muted-foreground">{entry.timeLabel}</p>
        <Button
          type="button"
          variant="plain"
          size="lg"
          className="-mr-3 px-3 text-destructive hover:text-destructive"
          aria-label={`Borrar el registro de las ${entry.timeLabel}`}
          onClick={onDelete}
        >
          <Trash2 aria-hidden />
          {T.deleteLabel}
        </Button>
      </div>
      {entry.note ? <p className="whitespace-pre-wrap break-words text-body-lg">{entry.note}</p> : null}
      {entry.hasPhoto ? (
        photoFailed ? (
          <div className="mt-2 flex size-16 items-center justify-center rounded-lg bg-secondary text-tertiary">
            <ImageOff className="size-5" aria-hidden />
            <span className="sr-only">{T.photoAlt}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenPhoto}
            aria-label="Ver la foto en grande"
            className="press mt-2 block size-16 overflow-hidden rounded-lg bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/portal/diario/photo/${entry.id}`}
              alt=""
              loading="lazy"
              width={64}
              height={64}
              className="size-16 object-cover"
              onError={() => setPhotoFailed(true)}
            />
          </button>
        )
      ) : null}
    </>
  );
}
