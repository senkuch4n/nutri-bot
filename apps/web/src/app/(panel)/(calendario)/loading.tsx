import { CalendarGridSkeleton, CalendarToolbarSkeleton } from "../calendar-toolbar";

/** Esqueleto con la forma del calendario (HU-017b-1, SDD 5.3): la barra propia (en < 640 px, el título
 *  arriba) y la grilla. Sin encabezado ni resumen desde 2026-10-31. */
export default function CalendarLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <CalendarToolbarSkeleton />
      <CalendarGridSkeleton />
    </div>
  );
}
