import { Skeleton } from "@/components/primitives/skeleton";

/** Esqueleto con la forma del calendario: encabezado, franja de resumen y la tarjeta con la grilla. */
export default function CalendarLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="mb-4 h-11 w-full rounded-lg" />
      <div className="rounded-lg border p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-44" />
        </div>
        <div className="mb-2 grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-4" />
          ))}
        </div>
        <Skeleton className="h-[26rem] w-full" />
      </div>
    </div>
  );
}
