import { Skeleton } from "@/components/primitives/skeleton";

/** Carga del Inicio: el título y la misma grilla (tres tarjetas arriba; hoy y la seña abajo). */
export default function HomeLoading() {
  const panel = "rounded-[1.75rem] border border-black/[0.05] bg-[#fcfbfd] p-6";
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="mb-6 h-9 w-32" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-h-48 space-y-3 rounded-[1.75rem] bg-[#f6f5f8] p-6">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-8 h-12 w-32" />
        </div>
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className={`${panel} flex min-h-48 flex-col justify-center gap-3`}>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-7 w-44" />
          </div>
        ))}
        <div className={`${panel} min-h-[28rem] space-y-4`}>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-10 w-56 rounded-full" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
        <div className={`${panel} min-h-[28rem] space-y-4 lg:col-span-2`}>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-9 w-28 rounded-full" />
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
