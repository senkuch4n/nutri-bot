import { useEffect } from "react";
import { toast } from "sonner";

// Se usa desde componentes cliente. El <Toaster /> está montado en los layouts del panel y del portal.

export const notify = {
  saved: (message?: string) => {
    toast.success(message ?? "Cambios guardados");
  },
  error: (message?: string) => {
    toast.error(message ?? "No se pudo guardar. Probá de nuevo.");
  },
  info: (message: string) => {
    toast(message);
  },
  /**
   * HU-018b (SDD 7.9): toast con "Deshacer" (8 s). El botón de acción lleva 44 px de alto
   * (objetivo de toque); su color sale de `toastClassNames.actionButton`.
   */
  undo: (message: string, onUndo: () => void | Promise<void>) => {
    toast(message, {
      duration: 8000,
      action: { label: "Deshacer", onClick: () => void onUndo() },
      classNames: { actionButton: "!h-11 !px-4 !text-callout !font-semibold" },
    });
  },
};

/**
 * Encaja con el patrón `useActionState` + `{ ok, error }`: al cambiar la identidad de `state`,
 * si `ok` → toast de guardado; si `error` y `errorAsToast` → toast de error (por defecto el
 * error va inline con <FormError />).
 */
export function useActionToast(
  state: { ok: boolean; error?: string },
  options?: { success?: string; errorAsToast?: boolean },
): void {
  const success = options?.success;
  const errorAsToast = options?.errorAsToast ?? false;
  useEffect(() => {
    if (state.ok) notify.saved(success);
    else if (state.error && errorAsToast) notify.error(state.error);
    // Solo la identidad de `state`: cada action devuelve un objeto nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
