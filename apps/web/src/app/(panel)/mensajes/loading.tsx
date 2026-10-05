import { Skeleton } from "@/components/primitives/skeleton";

// HU-017b-3: el esqueleto sigue la pantalla nueva: segmentado y tarjetas.
export default function MensajesLoading() {
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
      <Skeleton className="mb-5 h-10 w-full rounded-full sm:w-72" />
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl bg-card p-5 shadow-card">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-11 w-56 rounded-lg" />
              <Skeleton className="h-11 w-36 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
