"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/**
 * Botón de envío que muestra el estado pendiente del `<form action>` que lo contiene.
 * Sirve para forms con action (server actions o funciones) que no usan `useActionState`:
 * da el "Agregando…/Borrando…" sin tocar la action. Se puede importar desde server components.
 */
export function SubmitButton({
  pendingLabel,
  children,
  ...rest
}: Omit<ComponentProps<typeof Button>, "type" | "loading"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} {...rest}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
