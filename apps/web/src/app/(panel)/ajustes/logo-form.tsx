"use client";

import { useActionState } from "react";
import { Image } from "lucide-react";
import { Button, FormError } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import { uploadLogoAction, removeLogoAction, type SettingsState } from "./actions";

const initial: SettingsState = { ok: false };

export function LogoForm({ hasLogo }: { hasLogo: boolean }) {
  const [state, action, pending] = useActionState(uploadLogoAction, initial);
  useActionToast(state, { success: "Logo actualizado" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-6">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/professional/logo?t=${state.ok ? Date.now() : 0}`}
            alt="Logo actual"
            width={64}
            height={64}
            className="h-16 w-16 rounded-md border object-contain p-1"
          />
        ) : (
          <div className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground">
            <Image className="h-5 w-5" aria-hidden />
            Sin logo
          </div>
        )}

        <form action={action} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp"
            required
            aria-label="Archivo del logo"
            className="text-sm text-muted-foreground file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
          />
          <Button type="submit" size="sm" loading={pending}>
            {pending ? "Subiendo…" : "Subir logo"}
          </Button>
        </form>

        {hasLogo ? (
          <form action={removeLogoAction}>
            <Button type="submit" size="sm" variant="ghost">
              Quitar
            </Button>
          </form>
        ) : null}
      </div>
      <FormError message={state.error} />
    </div>
  );
}
