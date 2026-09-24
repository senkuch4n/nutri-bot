import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

export default function DisponibilidadLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] lg:items-start">
        <CardSkeleton bare lines={10} />
        <CardSkeleton bare lines={4} />
      </div>
    </div>
  );
}
