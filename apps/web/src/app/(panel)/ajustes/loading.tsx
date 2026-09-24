import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

export default function AjustesLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <div className="flex gap-2 lg:flex-col lg:gap-1">
          <Skeleton className="h-8 w-32 lg:w-full" />
          <Skeleton className="h-8 w-32 lg:w-full" />
          <Skeleton className="h-8 w-32 lg:w-full" />
          <Skeleton className="h-8 w-32 lg:w-full" />
        </div>
        <div className="max-w-3xl">
          <CardSkeleton bare lines={6} />
        </div>
      </div>
    </div>
  );
}
