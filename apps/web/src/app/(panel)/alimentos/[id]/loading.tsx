import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

export default function AlimentoLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="max-w-3xl">
        <CardSkeleton lines={6} bare />
      </div>
    </div>
  );
}
