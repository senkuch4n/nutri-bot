// El modal de la ficha (ruta interceptada `pacientes/(directorio)/@modal/(.)[id]`) se monta después de
// navegar: el elemento tocado en la lista no le llega por props. La lista lo deja acá antes de
// `router.push` y el modal lo toma una sola vez al montarse. También deja lo que la fila ya sabe del
// paciente (iniciales, nombre, etapa): mientras carga la ficha, el modal muestra ese encabezado y los
// elementos compartidos del MorphDialog tienen a dónde viajar.
import type { PatientStage } from "@nutri-bot/core";

export type PatientModalPreview = { initials: string; name: string | null; stage: PatientStage | null };

let pending: { origin: HTMLElement | null; preview: PatientModalPreview | null } = { origin: null, preview: null };

export function setPatientModalOrigin(origin: HTMLElement | null, preview: PatientModalPreview | null = null): void {
  pending = { origin, preview };
}

/** Devuelve el origen guardado (si sigue en el DOM) y su vista previa, y los borra. */
export function takePatientModalOrigin(): { origin: HTMLElement | null; preview: PatientModalPreview | null } {
  const taken = pending;
  pending = { origin: null, preview: null };
  return { origin: taken.origin?.isConnected ? taken.origin : null, preview: taken.preview };
}
