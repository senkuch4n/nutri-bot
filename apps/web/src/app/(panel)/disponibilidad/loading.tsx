import { Skeleton } from "@/components/primitives/skeleton";

// HU-017b-2: el esqueleto sigue la pantalla: panel de los siete días y panel tintado de "Días especiales".
export default function DisponibilidadLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-48 rounded-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <div className="rounded-[1.75rem] border border-black/[0.05] bg-[#fcfbfd] p-5 sm:p-7">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="mt-2 h-4 w-64 max-w-full" />
          <div className="mt-4 divide-y divide-black/[0.05]">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-11 w-36 rounded-full" />
                <Skeleton className="ml-auto h-9 w-36 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4 rounded-[1.75rem] bg-[#f6f5f8] p-5 sm:p-7">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
