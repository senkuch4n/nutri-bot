"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ImageIcon } from "lucide-react";
import { PROFESSIONAL_TEXT, SETTINGS_TEXT as T } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Alert, Button, FormError } from "@/components/ui";
import { notify, useActionToast } from "@/lib/notify";
import { uploadLogoAction, removeLogoAction, type SettingsState } from "./actions";
import { ImagePicker, type ImagePickerHandle } from "./image-picker";

const initial: SettingsState = { ok: false };

/**
 * Logo de los PDF. HU-016 (sección 16, P4): solo PNG o JPG. `unsupportedNotice` != null cuando el
 * logo guardado está en un formato que react-pdf no dibuja (p. ej. WEBP): no se borra ni se
 * convierte; se avisa para que lo vuelva a subir.
 * HU-017b-4: selector propio con vista previa antes de "Subir logo" y "Quitar" con confirmación.
 */
export function LogoForm({
  hasLogo,
  version,
  unsupportedNotice,
}: {
  hasLogo: boolean;
  /** updatedAt de Professional: cambia la URL de la imagen después de subir. */
  version: number;
  unsupportedNotice: string | null;
}) {
  const confirm = useConfirm();
  const pickerRef = useRef<ImagePickerHandle>(null);
  const [chosen, setChosen] = useState(false);
  const [state, action, pending] = useActionState(uploadLogoAction, initial);
  const [removing, startRemove] = useTransition();
  useActionToast(state, { success: T.logoUploaded });

  useEffect(() => {
    if (state.ok) pickerRef.current?.clear();
  }, [state]);

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || !chosen) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  }

  // confirm() se espera ANTES de la transición y fuera de cualquier <form action>.
  async function handleRemove() {
    if (removing) return;
    const ok = await confirm({
      title: T.removeLogoTitle,
      description: T.removeLogoDescription,
      confirmLabel: T.removeLogo,
      destructive: true,
    });
    if (!ok) return;
    startRemove(async () => {
      try {
        await removeLogoAction();
        notify.saved(T.logoRemoved);
      } catch {
        notify.error();
      }
    });
  }

  return (
    <div className="space-y-4">
      {unsupportedNotice ? <Alert tone="warning">{unsupportedNotice}</Alert> : null}
      <div className="flex flex-wrap items-center gap-4">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/professional/logo?v=${version}`}
            alt="Logo actual"
            width={64}
            height={64}
            className="size-16 rounded-md border bg-white object-contain p-1"
          />
        ) : (
          <div className="flex size-16 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-footnote text-muted-foreground">
            <ImageIcon className="size-5" aria-hidden />
            {T.noLogo}
          </div>
        )}
        {hasLogo ? (
          <Button type="button" variant="danger" size="sm" loading={removing} disabled={pending} onClick={handleRemove}>
            {T.removeLogo}
          </Button>
        ) : null}
      </div>

      <form onSubmit={handleUpload} className="space-y-3">
        <ImagePicker
          ref={pickerRef}
          name="logo"
          accept="image/png,image/jpeg"
          inputLabel="Archivo del logo"
          disabled={pending}
          onChange={(file) => setChosen(file !== null)}
          previewClassName="size-24 rounded-md border bg-white object-contain p-1"
        />
        {chosen ? (
          <Button type="submit" loading={pending} disabled={removing}>
            {pending ? T.uploadingLogo : T.uploadLogo}
          </Button>
        ) : null}
      </form>
      <p className="text-footnote text-muted-foreground">{PROFESSIONAL_TEXT.logoLimits}</p>
      <FormError message={state.error} />
    </div>
  );
}
