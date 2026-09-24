import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

/** Fallback de las pantallas del portal: una sola columna, como todas sus páginas. */
export default function PortalLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <CardSkeleton lines={2} bare />
      <CardSkeleton lines={2} bare />
      <CardSkeleton lines={2} bare />
    </div>
  );
}
