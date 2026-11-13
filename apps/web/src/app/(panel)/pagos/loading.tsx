import { Skeleton } from "@/components/primitives/skeleton";

// HU-017b-3: el esqueleto sigue la pantalla nueva: ‹ mes ›, tres totales, buscador y lista agrupada.
export default function PagosLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-11 w-44 rounded-lg" />
      </div>
      <Skeleton className="mb-6 h-11 w-64" />
      <div className="mb-8 grid gap-4 rounded-xl bg-card p-5 shadow-card sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-11 w-full sm:w-72" />
        <Skeleton className="h-10 w-full rounded-full sm:w-80" />
      </div>
      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-56 max-w-full" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
