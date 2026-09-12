"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { uploadLogoAction, removeLogoAction, type SettingsState } from "./actions";

const initial: SettingsState = { ok: false };

export function LogoForm({ hasLogo }: { hasLogo: boolean }) {
  const [state, action, pending] = useActionState(uploadLogoAction, initial);

  return (
    <div className="flex flex-wrap items-center gap-6">
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/professional/logo?t=${state.ok ? Date.now() : 0}`}
          alt="Logo actual"
          className="h-16 w-16 border border-line object-contain p-1"
        />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center border border-dashed border-line text-[10px] text-ink-faint">
          Sin logo
        </div>
      )}

      <form action={action} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp"
          required
          className="text-sm text-ink-soft file:mr-3 file:border-2 file:border-ink file:bg-transparent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:uppercase file:tracking-[0.08em] file:text-ink"
        />
        <Button type="submit" size="sm" disabled={pending}>
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

      {state.error ? <span className="reveal text-sm text-red-600">{state.error}</span> : null}
    </div>
  );
}
