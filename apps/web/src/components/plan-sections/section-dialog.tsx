"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { PLAN_SECTION_LIMITS, PLAN_SECTION_TEXT } from "@nutri-bot/core";
import {
  MorphDialog,
  MorphDialogContent,
  MorphDialogTitle,
} from "@/components/primitives/morph-dialog";
import { Button, FormError, cn } from "@/components/ui";
import type { PlanSectionActionResult, PlanSectionView } from "./types";

/**
 * HU-020 (SDD 7.4), diseño de referencia 2026-10-31: alta y edición de un texto del plan como un documento.
 * A la izquierda, una columna tintada con la ✕, el nombre y las acciones; a la derecha, la hoja con el título
 * grande y el texto. Texto plano como siempre (el portal y el PDF lo muestran tal cual): sin barra de formato.
 * Título (80) y texto (20.000, con contador); los errores vuelven de la action por campo.
 */
export function SectionDialog({
  open,
  onOpenChange,
  section,
  origin,
  onSave,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = texto nuevo. */
  section: PlanSectionView | null;
  /** Desde dónde crece (el botón «Agregar texto»); null = aparece centrado. */
  origin: HTMLElement | null;
  onSave: (input: { title: string; body: string }) => Promise<PlanSectionActionResult>;
  description: string;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<{ title?: string; body?: string; form?: string }>({});
  const [pending, startTransition] = useTransition();
  const titleId = useId();
  const bodyId = useId();
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

  const heading = section ? section.title : PLAN_SECTION_TEXT.add;

  return (
    <MorphDialog open={open} onOpenChange={onOpenChange} origin={origin}>
      <MorphDialogContent
        closeSide="left"
        aria-describedby={undefined}
        className="w-[min(100%,68rem)] bg-[#fcfbfd]"
        onOpenAutoFocus={(e) => {
          // Texto nuevo: al título. Editando: al final del texto, para seguir escribiendo.
          e.preventDefault();
          if (!section) {
            titleRef.current?.focus();
            return;
          }
          const el = bodyRef.current;
          el?.focus();
          el?.setSelectionRange(el.value.length, el.value.length);
        }}
      >
        <form
          onSubmit={submit}
          noValidate
          // Sin el padding del cuerpo del diálogo: la columna y la hoja van de borde a borde.
          className="-m-6 flex min-h-[min(80dvh,40rem)] flex-col sm:flex-row"
        >
          <aside className="flex shrink-0 flex-col gap-4 border-black/[0.05] bg-[#f6f5f8] p-6 max-sm:border-b sm:w-72 sm:border-r">
            <div className="flex min-h-10 items-center pl-14">
              <MorphDialogTitle className="min-w-0 truncate text-body font-normal text-foreground">{heading}</MorphDialogTitle>
            </div>
            <p className="text-footnote text-muted-foreground">{description}</p>
            <FormError message={errors.form} />
            <div className="mt-auto flex flex-wrap gap-2 border-t border-black/[0.06] pt-4">
              <Button
                type="button"
                variant="ghost"
                className="rounded-full hover:bg-black/[0.05]"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={pending}
                className="rounded-full bg-foreground text-background hover:bg-foreground/85 pressed:bg-foreground/75"
              >
                {pending ? null : <Check aria-hidden />}
                {PLAN_SECTION_TEXT.save}
              </Button>
            </div>
          </aside>

          <div className="relative flex min-w-0 flex-1 flex-col px-6 pb-16 pt-6 sm:px-12 sm:pt-10">
            <label htmlFor={titleId} className="sr-only">
              {PLAN_SECTION_TEXT.titleLabel}
            </label>
            <input
              ref={titleRef}
              id={titleId}
              name="title"
              value={title}
              maxLength={PLAN_SECTION_LIMITS.titleMax}
              autoComplete="off"
              placeholder={PLAN_SECTION_TEXT.titleLabel}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? `${titleId}-error` : undefined}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-transparent text-title-1 font-semibold tracking-tight text-foreground outline-none placeholder:text-tertiary"
            />
            {errors.title ? (
              <p id={`${titleId}-error`} role="alert" className="mt-1 text-footnote text-destructive">
                {errors.title}
              </p>
            ) : null}

            <label htmlFor={bodyId} className="sr-only">
              {PLAN_SECTION_TEXT.bodyLabel}
            </label>
            <textarea
              ref={bodyRef}
              id={bodyId}
              name="body"
              value={body}
              maxLength={PLAN_SECTION_LIMITS.bodyMax}
              placeholder="Escribí el texto…"
              aria-invalid={errors.body ? true : undefined}
              aria-describedby={cn(counterId, errors.body && `${bodyId}-error`)}
              onChange={(e) => setBody(e.target.value)}
              className="mt-4 min-h-64 w-full flex-1 resize-none bg-transparent text-body leading-relaxed text-foreground outline-none placeholder:text-tertiary"
            />
            {errors.body ? (
              <p id={`${bodyId}-error`} role="alert" className="mt-1 text-footnote text-destructive">
                {errors.body}
              </p>
            ) : null}

            {/* Contador abajo a la derecha, como una etiqueta (en la referencia, «Borrador»). */}
            <p
              id={counterId}
              className="absolute bottom-4 right-4 rounded-full bg-black/[0.04] px-3 py-1 text-footnote tabular-nums text-muted-foreground"
            >
              {body.length.toLocaleString("es-AR")} / {PLAN_SECTION_LIMITS.bodyMax.toLocaleString("es-AR")}
            </p>
          </div>
        </form>
      </MorphDialogContent>
    </MorphDialog>
  );
}
