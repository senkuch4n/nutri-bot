import { Skeleton } from "@/components/primitives/skeleton";

// HU-021: esqueleto de /turnos: encabezado con botones, ‹ mes ›, cuatro tarjetas, buscador y filas.
export default function TurnosLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
      </div>
      <Skeleton className="mb-6 h-11 w-64" />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl bg-card px-5 py-4 shadow-card">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-11 w-full sm:w-80" />
        <Skeleton className="hidden h-4 w-16 sm:block" />
      </div>
      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
            <Skeleton className="h-6 w-24 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-4 w-64 max-w-full sm:hidden" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
