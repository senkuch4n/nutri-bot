"use client";

import { useState, useTransition } from "react";
import { PLAN_IMPORT_TEXT, PORTION_MAX, PORTION_MIN, formatPortions, stepPortions } from "@nutri-bot/core";
import { linkHintRecipeAction } from "@/app/(panel)/plantillas/import-actions";
import { Modal } from "@/components/modal";
import { StepperControl } from "@/components/stepper-control";
import { Button, FormError } from "@/components/ui";

/** HU-020 (SDD 7.2): "Vincular" una opción de colación con la receta que sugiere el importador. */
export function LinkRecipeDialog({
  open,
  onClose,
  templateId,
  hintId,
  label,
  recipeName,
}: {
  open: boolean;
  onClose: () => void;
  templateId: string;
  hintId: string;
  label: string;
  recipeName: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={PLAN_IMPORT_TEXT.linkTitle(recipeName)}
      description={`«${label}» pasa a ser la receta, con las porciones que elijas.`}
    >
      <LinkRecipeBody templateId={templateId} hintId={hintId} recipeName={recipeName} onClose={onClose} />
    </Modal>
  );
}

function LinkRecipeBody({
  templateId,
  hintId,
  recipeName,
  onClose,
}: {
  templateId: string;
  hintId: string;
  recipeName: string;
  onClose: () => void;
}) {
  const [portions, setPortions] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const r = await linkHintRecipeAction({ templateId, hintId, portions });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <StepperControl
        value={portions}
        onChange={setPortions}
        canDecrement={portions > PORTION_MIN}
        canIncrement={portions < PORTION_MAX}
        step={(d) => stepPortions(portions, d)}
        format={formatPortions}
        groupLabel={`Porciones de ${recipeName}`}
        minusLabel="Media porción menos"
        plusLabel="Media porción más"
        valueClassName="min-w-28"
      />
      <FormError message={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" size="lg" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" size="lg" loading={pending} onClick={confirm}>
          {PLAN_IMPORT_TEXT.linkConfirm}
        </Button>
      </div>
    </div>
  );
}
