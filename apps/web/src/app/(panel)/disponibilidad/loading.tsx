import { Skeleton } from "@/components/primitives/skeleton";

// HU-017b-2: el esqueleto sigue la pantalla nueva: lista de los siete días y "Días especiales".
export default function DisponibilidadLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-11 w-48 rounded-lg" />
      </div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <div>
          <Skeleton className="mb-2 ml-4 h-4 w-56" />
          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-11 w-36 rounded-full" />
                <Skeleton className="ml-auto h-9 w-36" />
              </div>
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="mb-2 ml-4 h-4 w-32" />
          <div className="space-y-3 rounded-xl bg-card p-4 shadow-card">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
          </div>
        </div>
      </div>
    </div>
  );
}
