import { Skeleton } from "@/components/primitives/skeleton";

// HU-021 V1: esqueleto de /turnos: título con ‹ mes ›, «Filtros» + «Nuevo turno», cuatro tarjetas grises y
// filas planas con divisores.
export default function TurnosLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-full" />
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl bg-muted px-5 py-4 sm:px-6 sm:py-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-10" />
          </div>
        ))}
      </div>
      <div className="hidden h-10 items-center gap-6 border-b border-border/60 sm:flex">
        {[16, 20, 12, 10, 12, 16, 14].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w * 0.25}rem` }} />
        ))}
      </div>
      <div className="border-t border-border/60 sm:border-t-0">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-border/60 py-4 sm:h-16 sm:py-0">
            <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
            <div className="flex-1 space-y-2 sm:flex-none">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-24 sm:hidden" />
              <Skeleton className="h-5 w-48 max-w-full rounded-full sm:hidden" />
            </div>
            <Skeleton className="hidden h-4 w-14 sm:block" />
            <Skeleton className="hidden h-4 w-10 sm:block" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
