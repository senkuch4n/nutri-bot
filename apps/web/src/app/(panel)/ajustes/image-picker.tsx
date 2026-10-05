"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { ImageUp } from "lucide-react";
import { SETTINGS_TEXT as T } from "@nutri-bot/core";
import { Button } from "@/components/ui";

export type ImagePickerHandle = { clear: () => void };

/**
 * Selector de archivo propio (HU §4.8, AJ3): "Elegir imagen" + nombre del archivo + vista previa antes de
 * subir. El `<input type="file">` real queda en el form (oculto) para que viaje en el FormData.
 */
export const ImagePicker = forwardRef<
  ImagePickerHandle,
  {
    name: string;
    accept: string;
    /** Texto para lectores de pantalla del input ("Archivo del logo"). */
    inputLabel: string;
    onChange?: (file: File | null) => void;
    previewClassName?: string;
    disabled?: boolean;
    describedBy?: string;
  }
>(function ImagePicker({ name, accept, inputLabel, onChange, previewClassName, disabled, describedBy }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const nameId = useId();

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(next: File | null) {
    setFile(next);
    onChange?.(next);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    pick(null);
  }

  useImperativeHandle(ref, () => ({ clear }));

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        aria-label={inputLabel}
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => pick(e.currentTarget.files?.[0] ?? null)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          aria-describedby={[nameId, describedBy].filter(Boolean).join(" ")}
          onClick={() => inputRef.current?.click()}
        >
          <ImageUp aria-hidden />
          {T.chooseImage}
        </Button>
        <span id={nameId} className="min-w-0 max-w-full truncate text-callout text-muted-foreground">
          {file ? file.name : T.noFile}
        </span>
        {file ? (
          <Button type="button" variant="plain" size="sm" onClick={clear} disabled={disabled}>
            {T.cancelFile}
          </Button>
        ) : null}
      </div>
      {preview ? (
        <figure className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={T.newPreview} className={previewClassName ?? "h-20 w-auto max-w-60 rounded-md border bg-white object-contain p-2"} />
          <figcaption className="text-footnote text-muted-foreground">{T.newPreview}</figcaption>
        </figure>
      ) : null}
    </div>
  );
});
