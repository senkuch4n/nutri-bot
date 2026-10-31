"use client";

import { useId, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { PLAN_IMPORT_TEXT, PLAN_SECTION_LIMITS, PLAN_SECTION_TEXT } from "@nutri-bot/core";
import {
  addPlanSectionAction,
  deletePlanSectionAction,
  movePlanSectionAction,
  updatePlanSectionAction,
} from "@/app/(panel)/plan-section-actions";
import { useConfirm } from "@/components/confirm";
import { MoreActionsMenu } from "@/components/more-actions-menu";
import { Button, Card, EmptyState } from "@/components/ui";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { SectionDialog } from "./section-dialog";
import type { PlanSectionView } from "./types";

/** Cuerpos más largos que esto se muestran plegados (line-clamp-4) con "Ver completo". */
const LONG_BODY = 280;

/**
 * HU-020 (D9, SDD 7.4): "Textos del plan" de una plantilla o de un plan (recomendaciones, consumo
 * diario, reemplazos…). Se copian al aplicar la plantilla y la paciente los ve en el portal y el PDF.
 */
export function PlanSectionsEditor({
  kind,
  ownerId,
  sections,
}: {
  kind: "template" | "plan";
  ownerId: string;
  sections: PlanSectionView[];
}) {
  const confirm = useConfirm();
  // `origin`: el botón «Agregar texto» desde el que crece el diálogo (al editar desde el menú, null: centrado).
  const [sheet, setSheet] = useState<{ open: boolean; section: PlanSectionView | null; origin: HTMLElement | null }>({
    open: false,
    section: null,
    origin: null,
  });
  const [, startTransition] = useTransition();
  const atLimit = sections.length >= PLAN_SECTION_LIMITS.maxPerOwner;
  const limitId = useId();

  const openNew = (e: React.MouseEvent<HTMLButtonElement>) => setSheet({ open: true, section: null, origin: e.currentTarget });

  function save(input: { title: string; body: string }) {
    const editing = sheet.section;
    return editing
      ? updatePlanSectionAction({ kind, ownerId, sectionId: editing.id, ...input })
      : addPlanSectionAction({ kind, ownerId, ...input });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) notify.error(r.error);
    });
  }

  async function remove(section: PlanSectionView) {
    const ok = await confirm({
      title: PLAN_SECTION_TEXT.deleteConfirm(section.title),
      description: "Se borra solo este texto.",
      confirmLabel: PLAN_SECTION_TEXT.delete,
    });
    if (ok) run(() => deletePlanSectionAction({ kind, ownerId, sectionId: section.id }));
  }

  const addButton = (
    <Button type="button" variant="secondary" onClick={openNew} disabled={atLimit} aria-describedby={atLimit ? limitId : undefined}>
      <Plus aria-hidden />
      {PLAN_SECTION_TEXT.add}
    </Button>
  );

  return (
    <Card
      title={PLAN_SECTION_TEXT.cardTitle}
      description={PLAN_SECTION_TEXT.cardDescription(kind)}
      actions={sections.length > 0 ? addButton : undefined}
    >
      {atLimit ? (
        <p id={limitId} className="mb-3 text-footnote text-muted-foreground">
          {PLAN_SECTION_TEXT.errors.tooMany}
        </p>
      ) : null}
      {sections.length === 0 ? (
        <EmptyState icon={FileText} title={PLAN_SECTION_TEXT.empty} action={addButton} />
      ) : (
        <ul className="space-y-3">
          {sections.map((section, i) => (
            <SectionCard
              key={section.id}
              section={section}
              actions={[
                { key: "edit", label: PLAN_SECTION_TEXT.edit, icon: <Pencil />, onSelect: () => setSheet({ open: true, section, origin: null }) },
                ...(i > 0
                  ? [{ key: "up", label: PLAN_SECTION_TEXT.moveUp, icon: <ArrowUp />, onSelect: () => run(() => movePlanSectionAction({ kind, ownerId, sectionId: section.id, direction: -1 })) }]
                  : []),
                ...(i < sections.length - 1
                  ? [{ key: "down", label: PLAN_SECTION_TEXT.moveDown, icon: <ArrowDown />, onSelect: () => run(() => movePlanSectionAction({ kind, ownerId, sectionId: section.id, direction: 1 })) }]
                  : []),
                { key: "delete", label: PLAN_SECTION_TEXT.delete, icon: <Trash2 />, destructive: true, onSelect: () => remove(section) },
              ]}
            />
          ))}
        </ul>
      )}
      <SectionDialog
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        section={sheet.section}
        origin={sheet.origin}
        onSave={save}
        description={PLAN_SECTION_TEXT.cardDescription(kind)}
      />
    </Card>
  );
}

function SectionCard({
  section,
  actions,
}: {
  section: PlanSectionView;
  actions: Parameters<typeof MoreActionsMenu>[0]["actions"];
}) {
  const [expanded, setExpanded] = useState(false);
  const long = section.body.length > LONG_BODY || section.body.split("\n").length > 4;
  const bodyId = `plan-section-${section.id}`;
  return (
    <li className="rounded-lg bg-secondary/60 px-4 py-3 more-contrast:border more-contrast:border-input">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 pt-2.5 text-headline [overflow-wrap:anywhere]">{section.title}</h3>
        <MoreActionsMenu actions={actions} label={`Más opciones de «${section.title}»`} />
      </div>
      <p
        id={bodyId}
        className={cn("mt-1 whitespace-pre-line text-body text-foreground [overflow-wrap:anywhere]", long && !expanded && "line-clamp-4")}
      >
        {section.body}
      </p>
      {long ? (
        <Button
          type="button"
          variant="link"
          className="mt-1"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? PLAN_IMPORT_TEXT.showLess : PLAN_IMPORT_TEXT.showMore}
        </Button>
      ) : null}
    </li>
  );
}
