"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { PLAN_SECTION_LIMITS, PLAN_SECTION_TEXT } from "@nutri-bot/core";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/primitives/sheet";
import { Button, Field, FormError, Input, Textarea } from "@/components/ui";
import type { PlanSectionActionResult, PlanSectionView } from "./types";

/**
 * HU-020 (SDD 7.4): alta y edición de un texto del plan. Título (80) y texto (20.000, con contador).
 * Los errores vuelven de la action por campo (validación de core en domain).
 */
export function SectionSheet({
  open,
  onOpenChange,
  section,
  onSave,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = texto nuevo. */
  section: PlanSectionView | null;
  onSave: (input: { title: string; body: string }) => Promise<PlanSectionActionResult>;
  description: string;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<{ title?: string; body?: string; form?: string }>({});
  const [pending, startTransition] = useTransition();
  const counterId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(section?.title ?? "");
    setBody(section?.body ?? "");
    setErrors({});
  }, [open, section]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const r = await onSave({ title, body });
      if (r.ok) {
        onOpenChange(false);
        return;
      }
      setErrors(r.field ? { [r.field]: r.error } : { form: r.error });
      // El foco va al campo con error (el mensaje queda debajo, con role="alert").
      if (r.field === "title") titleRef.current?.focus();
      if (r.field === "body") bodyRef.current?.focus();
    });
  }

  const heading = section ? PLAN_SECTION_TEXT.edit : PLAN_SECTION_TEXT.add;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{heading}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="mt-6 flex min-h-0 flex-1 flex-col gap-4" noValidate>
          <Field label={PLAN_SECTION_TEXT.titleLabel} error={errors.title}>
            <Input
              ref={titleRef}
              name="title"
              value={title}
              maxLength={PLAN_SECTION_LIMITS.titleMax}
              autoComplete="off"
              aria-invalid={errors.title ? true : undefined}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label={PLAN_SECTION_TEXT.bodyLabel} error={errors.body}>
            <Textarea
              ref={bodyRef}
              name="body"
              rows={12}
              value={body}
              maxLength={PLAN_SECTION_LIMITS.bodyMax}
              aria-invalid={errors.body ? true : undefined}
              aria-describedby={counterId}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <p id={counterId} className="-mt-2 text-right text-footnote tabular-nums text-muted-foreground">
            {body.length.toLocaleString("es-AR")} / {PLAN_SECTION_LIMITS.bodyMax.toLocaleString("es-AR")}
          </p>
          <FormError message={errors.form} />
          <SheetFooter className="mt-auto">
            <Button type="button" variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="lg" loading={pending}>
              {PLAN_SECTION_TEXT.save}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
