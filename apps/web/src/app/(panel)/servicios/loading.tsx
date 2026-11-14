import { Skeleton } from "@/components/primitives/skeleton";

// HU-017b-2: tarjetas con nombre, precio grande, línea de resumen y la fila Editar / "Lo ofrece el bot".
function ServiceCardSkeleton() {
  return (
    <div className="space-y-3 rounded-[1.75rem] border border-black/[0.05] bg-[#fcfbfd] p-5 sm:p-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-4 w-full" />
      <div className="flex items-center justify-between border-t border-black/[0.05] pt-4">
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="h-6 w-32" />
      </div>
    </div>
  );
}

export default function ServiciosLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-44 rounded-full" />
      </div>
      <Skeleton className="mb-3 ml-1 h-4 w-24" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <ServiceCardSkeleton />
        <ServiceCardSkeleton />
        <ServiceCardSkeleton />
      </div>
    </div>
  );
}
