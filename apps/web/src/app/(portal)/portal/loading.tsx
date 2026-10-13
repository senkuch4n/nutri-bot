import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

/** Fallback de las pantallas del portal (HU-017d-1 §5.3): forma del inicio nuevo. */
export default function PortalLoading() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="h-10 w-56" />
      <Skeleton className="mb-2 h-5 w-72 max-w-full" />
      <Skeleton className="h-32 rounded-xl" />
      <CardSkeleton lines={2} bare />
      <CardSkeleton lines={2} bare />
      <CardSkeleton lines={2} bare />
    </div>
  );
}
