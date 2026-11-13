"use client";

import { useEffect, useSyncExternalStore } from "react";
import { deferredDeletes } from "@/lib/deferred-delete";

const getSnapshot = () => deferredDeletes.hasGuardedPending();
const getServerSnapshot = () => false;

/**
 * HU-017b-1 (T10, Q13): mientras haya una cancelación de turno (o un comunicado) pendiente o
 * enviándose, el navegador pregunta antes de cerrar o recargar la pestaña. Si igual se cierra, no se
 * manda nada (falla del lado seguro). El texto del diálogo lo pone el navegador. No intercepta la
 * navegación interna: el plazo sigue corriendo dentro del panel. Se monta una vez en el layout.
 */
export function PendingUnloadGuard(): null {
  const guarded = useSyncExternalStore(deferredDeletes.subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!guarded) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [guarded]);

  return null;
}
