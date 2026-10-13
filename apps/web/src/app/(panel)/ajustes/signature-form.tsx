"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Signature } from "lucide-react";
import { PROFESSIONAL_TEXT as T, signatureImageSizeError } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Separator } from "@/components/primitives/separator";
import { Button, FormError } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import type { SettingsState } from "./actions";
import { ImagePicker, type ImagePickerHandle } from "./image-picker";
import { removeSignatureAction, uploadSignatureAction } from "./signature-actions";

const initial: SettingsState = { ok: false };

/**
 * HU-016 (D1–D4): imagen de la firma manuscrita. Form propio. HU-017b-4: selector de archivo propio
 * con vista previa antes de subir.
 * La vista previa sale de /api/professional/signature (solo con sesión del panel, sin caché).
 * El bloque de abajo usa los valores GUARDADOS de título y matrícula, no lo que se está tipeando.
 */
export function SignatureForm({
  hasSignature,
  version,
  lines,
}: {
  hasSignature: boolean;
  /** updatedAt de Professional: cambia la URL de la vista previa después de subir. */
  version: number;
  lines: { nameLine: string; licenseLine: string | null };
}) {
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  const pickerRef = useRef<ImagePickerHandle>(null);
  const [chosen, setChosen] = useState(false);
  const [uploadState, uploadAction, uploading] = useActionState(async (prev: SettingsState, fd: FormData) => {
    const result = await uploadSignatureAction(prev, fd);
    if (result.ok) {
      formRef.current?.reset();
      pickerRef.current?.clear();
    }
    return result;
  }, initial);
  const [removeState, removeAction, removing] = useActionState(removeSignatureAction, initial);
  useActionToast(uploadState, { success: T.signatureUploaded });
  useActionToast(removeState, { success: T.signatureRemoved });

  const [localError, setLocalError] = useState<string | null>(null);
  // Versión cuya vista previa falló al cargar; al subir otra firma cambia `version` y se reintenta.
  const [failedVersion, setFailedVersion] = useState<number | null>(null);
  const previewFailed = failedVersion === version;
  const src = `/api/professional/signature?v=${version}`;

  // Se despacha a mano (no `<form action>`) para hacer el pre-chequeo de tamaño en el cliente:
  // un archivo de más de 3 MB lo corta Next antes de llegar a la action.
  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (uploading) return;
    const formData = new FormData(e.currentTarget);
    const file = formData.get("signature");
    const error = signatureImageSizeError(file instanceof File ? file.size : 0);
    setLocalError(error);
    if (error) return;
    startTransition(() => uploadAction(formData));
  }

  // confirm() se espera ANTES de la transición y fuera de cualquier <form action>.
  async function handleRemove() {
    const ok = await confirm({
      title: T.removeConfirmTitle,
      description: T.removeConfirmDescription,
      confirmLabel: T.removeButton,
    });
    if (!ok) return;
    setLocalError(null);
    startTransition(() => removeAction());
  }

  const error = localError ?? uploadState.error ?? removeState.error;
  const showImage = hasSignature && !previewFailed;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-callout text-muted-foreground">{T.uploadHelp}</p>
        <p className="mt-1 text-footnote text-muted-foreground">{T.uploadLimits}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="Tu firma actual"
            width={240}
            height={80}
            className="h-20 w-60 rounded-md border bg-white object-contain p-2"
            onError={() => setFailedVersion(version)}
          />
        ) : (
          <div className="flex h-20 w-60 flex-col items-center justify-center gap-1 rounded-md border border-dashed px-2 text-center text-footnote text-muted-foreground">
            <Signature className="h-5 w-5" aria-hidden />
            {hasSignature ? T.previewError : T.emptyBox}
          </div>
        )}

        {hasSignature ? (
          <Button
            type="button"
            size="sm"
            variant="danger"
            loading={removing}
            disabled={uploading}
            onClick={handleRemove}
          >
            {removing ? T.removing : T.removeButton}
          </Button>
        ) : null}
      </div>
      <form ref={formRef} onSubmit={handleUpload} className="space-y-3">
        <ImagePicker
          ref={pickerRef}
          name="signature"
          accept="image/png,image/jpeg"
          inputLabel="Archivo de la firma"
          disabled={uploading}
          describedBy={error ? "signature-error" : undefined}
          onChange={(file) => {
            setChosen(file !== null);
            setLocalError(null);
          }}
          previewClassName="h-20 w-60 rounded-md border bg-white object-contain p-2"
        />
        {chosen ? (
          <Button type="submit" loading={uploading} disabled={removing}>
            {uploading ? T.uploading : T.uploadButton}
          </Button>
        ) : null}
      </form>
      <div id="signature-error">
        <FormError message={error} />
      </div>

      <Separator />
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{T.previewLabel}</p>
        <div className="flex justify-end rounded-md border bg-white p-4 text-neutral-900">
          <div className="flex w-60 flex-col items-center text-center">
            {showImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" width={240} height={48} className="h-12 w-full object-contain" />
            ) : null}
            <div className="w-full border-t border-neutral-900" />
            <p className="mt-1 max-w-full break-words text-sm font-medium">{lines.nameLine}</p>
            {lines.licenseLine ? <p className="max-w-full break-words text-xs">{lines.licenseLine}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
