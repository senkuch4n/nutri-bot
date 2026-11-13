import { Skeleton } from "@/components/primitives/skeleton";

// HU-017b-2: tarjetas con nombre, precio grande, línea de resumen y la fila Editar / "Lo ofrece el bot".
function ServiceCardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl bg-card p-6 shadow-card">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-4 w-full" />
      <div className="flex items-center justify-between pt-3">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-6 w-32" />
      </div>
    </div>
  );
}

export default function ServiciosLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-11 w-44 rounded-lg" />
      </div>
      <Skeleton className="mb-3 h-5 w-28" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ServiceCardSkeleton />
        <ServiceCardSkeleton />
        <ServiceCardSkeleton />
      </div>
    </div>
  );
}
