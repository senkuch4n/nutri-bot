import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

/** Carga del plan (página y modal de la ficha): el encabezado en su panel tintado y el contenido en
 *  paneles de contorno fino, como PlanDetail, para que no salte al llegar los datos. */
export default function PlanLoading() {
  const panel = "rounded-[1.75rem] border border-black/[0.05] bg-[#fcfbfd] p-5 sm:p-7";
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="space-y-3 rounded-[1.75rem] bg-[#f6f5f8] p-5 sm:p-7">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-48 max-w-full" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className={panel}>
          <Skeleton className="mb-6 h-16 w-full" />
          <CardSkeleton lines={6} bare />
        </div>
        <div className="space-y-4">
          <div className={panel}>
            <CardSkeleton lines={3} bare />
          </div>
          <div className={panel}>
            <CardSkeleton lines={3} bare />
          </div>
        </div>
      </div>
    </div>
  );
}
