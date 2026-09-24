import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

export default function ServiciosLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-8">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div>
        <Skeleton className="mb-4 h-5 w-24" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <CardSkeleton bare lines={4} />
          <CardSkeleton bare lines={4} />
          <CardSkeleton bare lines={4} />
        </div>
      </div>
    </div>
  );
}
