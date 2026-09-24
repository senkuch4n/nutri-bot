import { Skeleton } from "@/components/primitives/skeleton";
import { TableSkeleton } from "@/components/skeletons";

export default function PacientesLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="mb-4 h-9 w-72 max-w-full" />
      <TableSkeleton rows={8} columns={3} bare />
    </div>
  );
}
