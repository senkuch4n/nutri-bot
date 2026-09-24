import { Skeleton } from "@/components/primitives/skeleton";
import { TableSkeleton } from "@/components/skeletons";

export default function PlantillasLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <TableSkeleton rows={5} columns={2} bare />
    </div>
  );
}
