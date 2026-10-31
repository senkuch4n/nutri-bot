"use client";

import { useState, useTransition } from "react";
import { PLAN_IMPORT_TEXT, WEEKDAYS, WEEKDAY_LABELS, type Weekday } from "@nutri-bot/core";
import { resolveUnplacedHintAction } from "@/app/(panel)/plantillas/import-actions";
import { Modal } from "@/components/modal";
import { Button, Field, FormError, Select } from "@/components/ui";
import type { ReviewMealOption } from "./types";

const NEW_SECTION = "__new__";

/** HU-020 (SDD 7.2, T19): "Mover a…" una línea de "Texto sin ubicar" a una comida o a un texto del plan. */
export function MoveUnplacedDialog({
  target,
  onClose,
  templateId,
  hintId,
  meals,
  sections,
}: {
  /** null = cerrado. */
  target: "meal" | "section" | null;
  onClose: () => void;
  templateId: string;
  hintId: string;
  meals: ReviewMealOption[];
  sections: { id: string; title: string }[];
}) {
  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={target === "section" ? PLAN_IMPORT_TEXT.moveToSection : PLAN_IMPORT_TEXT.moveToMeal}
    >
      {target ? (
        <MoveBody target={target} onClose={onClose} templateId={templateId} hintId={hintId} meals={meals} sections={sections} />
      ) : null}
    </Modal>
  );
}

function MoveBody({
  target,
  onClose,
  templateId,
  hintId,
  meals,
  sections,
}: {
  target: "meal" | "section";
  onClose: () => void;
  templateId: string;
  hintId: string;
  meals: ReviewMealOption[];
  sections: { id: string; title: string }[];
}) {
  const [mealId, setMealId] = useState(meals[0]?.id ?? "");
  const [weekday, setWeekday] = useState<Weekday>("MON");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? NEW_SECTION);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const meal = meals.find((m) => m.id === mealId);
  const perDay = meal?.mode === "PER_DAY";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const r = await resolveUnplacedHintAction({
        templateId,
        hintId,
        target:
          target === "meal"
            ? { kind: "meal", mealId, weekday: perDay ? weekday : null }
            : { kind: "section", sectionId: sectionId === NEW_SECTION ? null : sectionId },
      });
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {target === "meal" ? (
        <>
          <Field label="Comida">
            <Select value={mealId} onChange={(e) => setMealId(e.target.value)} required>
              {meals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          {perDay ? (
            <Field label="Día">
              <Select value={weekday} onChange={(e) => setWeekday(e.target.value as Weekday)}>
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAY_LABELS[d].long}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </>
      ) : (
        <Field label="Texto del plan">
          <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
            <option value={NEW_SECTION}>{`${PLAN_IMPORT_TEXT.newSectionTitle} (nuevo)`}</option>
          </Select>
        </Field>
      )}
      <FormError message={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" size="lg" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" loading={pending} disabled={target === "meal" && !mealId}>
          Mover
        </Button>
      </div>
    </form>
  );
}
