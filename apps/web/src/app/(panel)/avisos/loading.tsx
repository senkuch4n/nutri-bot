import { Skeleton } from "@/components/primitives/skeleton";

// HU-017b-3: el esqueleto sigue la pantalla nueva: comunicado arriba y la cola como lista agrupada.
export default function AvisosLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="mb-3 h-6 w-80 max-w-full" />
      <div className="mb-10 space-y-3 rounded-xl bg-card p-5 shadow-card">
        <Skeleton className="h-20 w-full" />
        <div className="flex justify-between gap-4">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-11 w-44 rounded-lg" />
        </div>
      </div>
      <Skeleton className="mb-3 h-6 w-64" />
      <Skeleton className="mb-4 h-10 w-full rounded-full sm:w-96" />
      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-2 border-b px-4 py-3 last:border-b-0">
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
