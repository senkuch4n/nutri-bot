import { Skeleton } from "@/components/primitives/skeleton";
import { GroupedListSkeleton } from "@/components/skeletons";

// Misma geometría que la lista (HU-017c-1, SDD 5.6): título, buscador de 48 px, contador y filas de 56 px.
export default function PacientesLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="mb-8 h-8 w-40" />
      <div className="max-w-3xl">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="mb-3 mt-3.5 h-3 w-24" />
        <GroupedListSkeleton rows={8} bare />
      </div>
    </div>
  );
}
