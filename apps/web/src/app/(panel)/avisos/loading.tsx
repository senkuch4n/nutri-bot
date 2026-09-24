import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton, TableSkeleton } from "@/components/skeletons";

export default function AvisosLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <CardSkeleton bare lines={3} />
      <div className="mt-6">
        <TableSkeleton bare rows={6} columns={5} />
      </div>
    </div>
  );
}
