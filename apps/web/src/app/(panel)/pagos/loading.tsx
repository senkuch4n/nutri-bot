import { Skeleton } from "@/components/primitives/skeleton";
import { TableSkeleton } from "@/components/skeletons";

export default function PagosLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-8">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="h-9 w-40" />
        </div>
        <TableSkeleton bare rows={6} columns={8} />
      </div>
    </div>
  );
}
