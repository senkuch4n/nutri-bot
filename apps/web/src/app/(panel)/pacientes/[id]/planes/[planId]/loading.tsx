import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

export default function PlanLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="mb-6 h-16 w-full" />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <CardSkeleton lines={6} bare />
        <div className="space-y-6">
          <CardSkeleton lines={3} bare />
          <CardSkeleton lines={3} bare />
        </div>
      </div>
    </div>
  );
}
