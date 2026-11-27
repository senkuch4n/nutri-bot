import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

/** HU-029b: esqueleto propio (sin él se vería el de otra ruta). */
export default function SubscriptionLoading() {
  return (
    <div role="status" aria-busy="true" className="max-w-3xl">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-8 h-8 w-48" />
      <CardSkeleton bare lines={3} />
    </div>
  );
}
