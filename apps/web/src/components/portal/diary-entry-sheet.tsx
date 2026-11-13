"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ChangeEvent } from "react";
import { Camera, ImageIcon, X } from "lucide-react";
import { PORTAL_DIARY_TEXT as T } from "@nutri-bot/core";
import { addDiaryEntryAction } from "@/app/(portal)/portal/diario/actions";
import { useConfirm } from "@/components/confirm";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/primitives/sheet";
import { Button, Field, Textarea, cn } from "@/components/ui";
import { notify } from "@/lib/notify";
import { resizePhotoForUpload } from "@/lib/photo-resize";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { useMediaQuery } from "@/lib/use-media-query";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

// HU-017d-2 (SDD 4.5): "Anotar comida". Sheet desde abajo con agarre en el celular y desde la derecha
// desde 768 px (D12). Con algo escrito o una foto, cerrar (X, Esc, tocar afuera, arrastrar) pregunta
// "¿Descartar lo que anotaste?". La foto se achica al elegirla (D10, Q8). Sin useActionState: un error
// de red no sube al error boundary y lo escrito queda.

const DISCARD = {
  title: T.discardTitle,
  description: T.discardBody,
  confirmLabel: T.discardConfirm,
  cancelLabel: T.discardCancel,
};

const ERROR_ID = "portal-diary-note-error";

type Photo = { file: File; previewUrl: string };

export function DiaryEntrySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const compact = useMediaQuery("(max-width: 767px)");
  const keyboardInset = useKeyboardInset(open && compact);
  const confirm = useConfirm();
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  // Cada apertura es una "generación": una foto que termina de prepararse después de cerrar se descarta.
  const generation = useRef(0);
  const submitting = useRef(false);
  const dirty = note.trim() !== "" || photo !== null;

  useUnsavedChangesGuard(open && dirty, DISCARD);

  // Al cerrar (por lo que sea) se limpia todo; el panel que sale muestra su última foto (useExitSnapshot).
  useEffect(() => {
    if (open) return;
    generation.current += 1;
    setNote("");
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setPreparing(false);
    setError(null);
  }, [open]);

  const requestOpenChange = useCallback(
    async (next: boolean) => {
      if (next) {
        onOpenChange(true);
        return;
      }
      if (pending || submitting.current) return;
      if (!dirty) {
        onOpenChange(false);
        return;
      }
      // `confirm` desde un handler, nunca dentro de una transición (ver useConfirm).
      if (await confirm({ ...DISCARD, destructive: true })) onOpenChange(false);
    },
    [confirm, dirty, onOpenChange, pending],
  );

  async function onPhotoChosen(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Elegir la misma foto otra vez tiene que volver a disparar `change`.
    input.value = "";
    if (!file) return;
    const gen = generation.current;
    setPreparing(true);
    setError(null);
    const result = await resizePhotoForUpload(file);
    if (gen !== generation.current) return;
    setPreparing(false);
    if (!result.ok) {
      setError(T.errorPhoto);
      return;
    }
    const previewUrl = URL.createObjectURL(result.file);
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file: result.file, previewUrl };
    });
  }

  function removePhoto() {
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  function save() {
    if (pending || preparing || submitting.current) return;
    if (!dirty) {
      setError(T.errorEmpty);
      return;
    }
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("note", note);
        if (photo) fd.set("photo", photo.file);
        const result = await addDiaryEntryAction({ ok: false }, fd);
        if (result.ok) {
          notify.saved(T.saved);
          onOpenChange(false);
        } else {
          setError(result.error ?? T.errorSave);
        }
      } catch {
        setError(T.errorSave);
      } finally {
        submitting.current = false;
      }
    });
  }

  const busy = pending || preparing;

  return (
    <Sheet open={open} onOpenChange={(next) => void requestOpenChange(next)}>
      <SheetContent
        side={compact ? "bottom" : "right"}
        className={cn("theme-portal", compact ? "" : "w-full sm:max-w-md")}
        style={compact && keyboardInset > 0 ? { bottom: keyboardInset } : undefined}
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // En el celular el foco va al título: que el teclado no se abra solo. En escritorio, al campo.
          if (compact) titleRef.current?.focus();
          else textareaRef.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {T.sheetTitle}
          </SheetTitle>
        </SheetHeader>

        <form
          className="mt-5 space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div>
            <Field label={T.noteLabel}>
              <Textarea
                ref={textareaRef}
                name="note"
                autoComplete="off"
                rows={3}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                  if (error === T.errorEmpty) setError(null);
                }}
                placeholder={T.notePlaceholder}
                aria-describedby={error ? ERROR_ID : undefined}
                aria-invalid={error === T.errorEmpty || undefined}
                className="min-h-24 text-body-lg"
              />
            </Field>
            {error ? (
              <p id={ERROR_ID} role="alert" className="mt-2 text-callout text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            tabIndex={-1}
            onChange={(e) => void onPhotoChosen(e)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            hidden
            tabIndex={-1}
            onChange={(e) => void onPhotoChosen(e)}
          />

          {photo ? (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.previewUrl}
                alt={T.photoAlt}
                width={96}
                height={96}
                className="size-24 shrink-0 rounded-xl bg-secondary object-cover"
              />
              <Button type="button" variant="plain" size="lg" onClick={removePhoto} disabled={pending}>
                <X aria-hidden />
                {T.removePhoto}
              </Button>
            </div>
          ) : compact ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="tinted"
                size="lg"
                className="h-auto min-h-11 whitespace-normal py-2 leading-tight"
                disabled={busy}
                onClick={() => cameraRef.current?.click()}
              >
                <Camera aria-hidden />
                {T.takePhoto}
              </Button>
              <Button
                type="button"
                variant="tinted"
                size="lg"
                className="h-auto min-h-11 whitespace-normal py-2 leading-tight"
                disabled={busy}
                onClick={() => galleryRef.current?.click()}
              >
                <ImageIcon aria-hidden />
                {T.pickFromGallery}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="tinted"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
            >
              <ImageIcon aria-hidden />
              {T.pickPhoto}
            </Button>
          )}

          {preparing ? (
            <p role="status" className="text-callout text-muted-foreground">
              {T.preparingPhoto}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" loading={pending} disabled={preparing}>
            {pending ? T.saving : T.save}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
