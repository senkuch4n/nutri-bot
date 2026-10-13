"use client";

import { useEffect, useState } from "react";
import { PenLine } from "lucide-react";
import { PORTAL_DIARY_TEXT as T } from "@nutri-bot/core";
import { Button, EmptyState } from "@/components/ui";
import { usePendingDeletions } from "@/lib/deferred-delete";
import { replaceUrlInRouter } from "@/lib/patient-tab-route";
import { DIARY_TITLE_ID, DiaryList, visibleDiaryGroups } from "./diary-list";
import { DiaryEntrySheet } from "./diary-entry-sheet";

// HU-017d-2 (SDD 4.5): "Tu diario". Recibe solo datos planos del servidor (T9a).

export type DiaryEntryRow = { id: string; note: string | null; hasPhoto: boolean; timeLabel: string };
export type DiaryGroupRow = { dayKey: string; label: string; entries: DiaryEntryRow[] };

export function DiaryScreen({ groups, openOnMount }: { groups: DiaryGroupRow[]; openOnMount: boolean }) {
  const [open, setOpen] = useState(false);
  const pending = usePendingDeletions();
  const empty = visibleDiaryGroups(groups, pending).length === 0;

  // Desde el inicio (?anotar=1): abre el sheet y deja la URL limpia, así recargar no lo reabre (T9b).
  useEffect(() => {
    if (!openOnMount) return;
    setOpen(true);
    replaceUrlInRouter("/portal/diario");
  }, [openOnMount]);

  return (
    <div className="space-y-6">
      <header>
        <h1 id={DIARY_TITLE_ID} tabIndex={-1} className="text-balance text-title-1 outline-none">
          {T.title}
        </h1>
        <p className="mt-1 text-pretty text-body-lg text-muted-foreground">{T.subtitle}</p>
      </header>

      <Button type="button" size="lg" className="w-full" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <PenLine aria-hidden />
        {T.addMeal}
      </Button>

      {empty ? (
        <div className="rounded-xl bg-card shadow-card">
          <EmptyState title={T.emptyTitle} />
        </div>
      ) : (
        <DiaryList groups={groups} />
      )}

      <DiaryEntrySheet open={open} onOpenChange={setOpen} />
    </div>
  );
}
