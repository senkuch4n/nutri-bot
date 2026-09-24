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
