import { Skeleton } from "@/components/primitives/skeleton";
import { CalendarGridSkeleton, CalendarToolbarSkeleton } from "../calendar-toolbar";

/** Esqueleto con la forma del calendario (HU-017b-1, SDD 5.3): encabezado, franja de resumen de una
 *  línea, la barra propia (en < 640 px, el título arriba) y la grilla. */
export default function CalendarLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="mb-4 h-11 w-full rounded-lg" />
      <div className="rounded-lg border p-4">
        <CalendarToolbarSkeleton />
        <CalendarGridSkeleton />
      </div>
    </div>
  );
}
