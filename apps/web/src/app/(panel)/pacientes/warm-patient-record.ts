// La ficha del paciente usa decenas de componentes de cliente (pestañas, gráficos, hojas). La primera
// vez que se abre el modal, bajarlos y evaluarlos coincide con la animación de apertura y la traba.
// Con la lista quieta (en un momento ocioso) se cargan de antemano: cuando se abre la ficha, sus
// módulos ya están evaluados y solo queda renderizarla. No toca la navegación ni lo que se muestra.

let warmed = false;

export function warmPatientRecord(): void {
  if (warmed) return;
  warmed = true;
  void Promise.all([
    import("./[id]/patient-tabs"),
    import("./[id]/patient-header-actions"),
    import("./[id]/edit-patient-sheet"),
    import("./[id]/archived-banner"),
    import("./[id]/consultations-section"),
    import("./[id]/evolution-section"),
    import("./[id]/history-section"),
    import("./[id]/plans-section"),
  ]).catch(() => {
    // Sin red o con un chunk que falló: se vuelve a intentar en la próxima visita a la lista.
    warmed = false;
  });
}

/** Corre `warmPatientRecord` cuando el navegador está ocioso; devuelve la cancelación. */
export function warmPatientRecordWhenIdle(): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(warmPatientRecord, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(warmPatientRecord, 1500);
  return () => window.clearTimeout(id);
}
