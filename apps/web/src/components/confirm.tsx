"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/primitives/alert-dialog";
import { buttonVariants } from "@/components/primitives/button";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** default true → botón de confirmar destructivo */
  destructive?: boolean;
};

type Pending = { options: ConfirmOptions; resolve: (value: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/** Montado en el layout del panel. Reemplazo directo de `confirm()` nativo. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending((prev) => {
        // Si había otra pendiente, se cierra como cancelada.
        prev?.resolve(false);
        return { options, resolve };
      });
    });
  }, []);

  // Resuelve una sola vez: al cerrar, `pending` pasa a null.
  function settle(value: boolean) {
    setPending((prev) => {
      prev?.resolve(value);
      return null;
    });
  }

  const options = pending?.options;
  const destructive = options?.destructive ?? true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            <AlertDialogDescription>{options?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} onClick={() => settle(false)}>
              {options?.cancelLabel ?? "Cancelar"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              // Rojo lleno solo acá: es la confirmación final de una acción destructiva (T13).
              className={cn(destructive && buttonVariants({ variant: "destructive", size: "lg" }))}
            >
              {options?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Devuelve `confirm(options)`: abre el diálogo y resuelve `true`/`false` según lo que elija el usuario.
 *
 * ⚠️ **No** hacer `await confirm()` dentro de `<form action>` ni de `startTransition`: en React 19 la
 * action corre en una transición, el `setPending` del diálogo toma ese lane y React no lo confirma
 * hasta que la promesa termine; como la promesa espera al diálogo, queda en deadlock (el diálogo
 * nunca se monta y el botón queda colgado).
 *
 * Patrón correcto: `onClick={async () => { if (!(await confirm(...))) return; startTransition(() => action(...)); }}`
 * (o `onSubmit` con `preventDefault` incondicional y la action despachada después en `startTransition`).
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm necesita <ConfirmProvider> (está en el layout del panel)");
  }
  return confirm;
}
