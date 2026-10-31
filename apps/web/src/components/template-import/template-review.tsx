"use client";

import { useId, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { PLAN_IMPORT_TEXT, templateHintText, unplacedCount, type TemplateImportHint } from "@nutri-bot/core";
import { dismissTemplateHintAction, publishTemplateAction } from "@/app/(panel)/plantillas/import-actions";
import { useConfirm } from "@/components/confirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu";
import { Alert, Button, Card } from "@/components/ui";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { LinkRecipeDialog } from "./link-recipe-dialog";
import { MoveUnplacedDialog } from "./move-unplaced-dialog";
import type { TemplateReviewProps } from "./types";

/** Textos sin ubicar más largos que esto se muestran plegados (line-clamp-3). */
const LONG_UNPLACED = 200;

/**
 * HU-020 (SDD 7.2): bloque de revisión de un borrador importado de PDF: banner con "Publicar
 * plantilla", avisos del importador y "Texto sin ubicar". Solo se monta si la plantilla es borrador.
 */
export function TemplateReview({ templateId, hints, meals, sections }: TemplateReviewProps) {
  const [pending, startTransition] = useTransition();
  const blockedId = useId();
  const unplaced = hints.filter((h): h is Extract<TemplateImportHint, { kind: "UNPLACED" }> => h.kind === "UNPLACED");
  const notices = hints.filter((h) => h.kind !== "UNPLACED");
  const blocked = unplacedCount(hints);

  function publish() {
    startTransition(async () => {
      const r = await publishTemplateAction({ templateId });
      if (r.ok) notify.saved(PLAN_IMPORT_TEXT.published);
      else notify.error(r.error);
    });
  }

  return (
    <div className="mb-8 space-y-4">
      <Alert tone="warning">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-pretty">{PLAN_IMPORT_TEXT.banner}</p>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button
              type="button"
              size="lg"
              loading={pending}
              disabled={blocked > 0}
              aria-describedby={blocked > 0 ? blockedId : undefined}
              onClick={publish}
            >
              {pending ? PLAN_IMPORT_TEXT.publishing : PLAN_IMPORT_TEXT.publishButton}
            </Button>
            {blocked > 0 ? (
              <p id={blockedId} className="text-footnote text-muted-foreground">
                {PLAN_IMPORT_TEXT.publishBlocked(blocked)}
              </p>
            ) : null}
          </div>
        </div>
      </Alert>

      {notices.length > 0 ? (
        <Card padding="none">
          <details open className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-6 py-3 text-headline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              {PLAN_IMPORT_TEXT.hintsTitle(notices.length)}
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
            </summary>
            <ul className="divide-y border-t">
              {notices.map((hint) => (
                <HintRow key={hint.id} templateId={templateId} hint={hint} />
              ))}
            </ul>
          </details>
        </Card>
      ) : null}

      {unplaced.length > 0 ? (
        <Card title={PLAN_IMPORT_TEXT.unplacedTitle} padding="none">
          <ul className="divide-y">
            {unplaced.map((hint) => (
              <UnplacedRow key={hint.id} templateId={templateId} hint={hint} meals={meals} sections={sections} />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function HintRow({ templateId, hint }: { templateId: string; hint: TemplateImportHint }) {
  const [pending, startTransition] = useTransition();
  const [linking, setLinking] = useState(false);

  function dismiss() {
    startTransition(async () => {
      const r = await dismissTemplateHintAction({ templateId, hintId: hint.id });
      if (!r.ok) notify.error(r.error);
    });
  }

  const isSuggestion = hint.kind === "RECIPE_SUGGESTION";
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-3">
      <p className="min-w-0 flex-1 text-pretty text-callout [overflow-wrap:anywhere]">{templateHintText(hint)}</p>
      <div className="flex shrink-0 items-center gap-2">
        {isSuggestion && hint.itemId ? (
          <>
            <Button type="button" variant="tinted" onClick={() => setLinking(true)} disabled={pending}>
              {PLAN_IMPORT_TEXT.recipeLink}
            </Button>
            <Button type="button" variant="ghost" loading={pending} onClick={dismiss}>
              {PLAN_IMPORT_TEXT.recipeKeepText}
            </Button>
            <LinkRecipeDialog
              open={linking}
              onClose={() => setLinking(false)}
              templateId={templateId}
              hintId={hint.id}
              label={hint.label}
              recipeName={hint.recipeName}
            />
          </>
        ) : (
          <Button type="button" variant="ghost" loading={pending} onClick={dismiss}>
            {PLAN_IMPORT_TEXT.hintDone}
          </Button>
        )}
      </div>
    </li>
  );
}

function UnplacedRow({
  templateId,
  hint,
  meals,
  sections,
}: {
  templateId: string;
  hint: Extract<TemplateImportHint, { kind: "UNPLACED" }>;
  meals: TemplateReviewProps["meals"];
  sections: TemplateReviewProps["sections"];
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [moveTo, setMoveTo] = useState<"meal" | "section" | null>(null);
  const textId = useId();
  const long = hint.text.length > LONG_UNPLACED;

  async function discard() {
    const ok = await confirm({
      title: `${PLAN_IMPORT_TEXT.discard} esta línea`,
      description: "No se guarda en ningún lado. No se puede deshacer.",
      confirmLabel: PLAN_IMPORT_TEXT.discard,
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await dismissTemplateHintAction({ templateId, hintId: hint.id });
      if (!r.ok) notify.error(r.error);
    });
  }

  return (
    <li className="px-6 py-4">
      <p className="text-footnote text-muted-foreground">{PLAN_IMPORT_TEXT.unplacedPage(hint.page)}</p>
      <p id={textId} className={cn("mt-1 whitespace-pre-line text-body [overflow-wrap:anywhere]", long && !expanded && "line-clamp-3")}>
        {hint.text}
      </p>
      {long ? (
        <Button type="button" variant="link" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded((v) => !v)}>
          {expanded ? PLAN_IMPORT_TEXT.showLess : PLAN_IMPORT_TEXT.showMore}
        </Button>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="secondary" disabled={pending}>
              {PLAN_IMPORT_TEXT.moveTo}
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled={meals.length === 0} onSelect={() => setMoveTo("meal")}>
              {PLAN_IMPORT_TEXT.moveToMeal}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMoveTo("section")}>{PLAN_IMPORT_TEXT.moveToSection}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="danger" loading={pending} onClick={discard}>
          {PLAN_IMPORT_TEXT.discard}
        </Button>
      </div>
      <MoveUnplacedDialog
        target={moveTo}
        onClose={() => setMoveTo(null)}
        templateId={templateId}
        hintId={hint.id}
        meals={meals}
        sections={sections}
      />
    </li>
  );
}
