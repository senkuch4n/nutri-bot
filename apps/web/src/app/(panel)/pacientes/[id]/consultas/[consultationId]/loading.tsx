import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

// Copiado de planes/[planId]/loading.tsx; en lugar de la barra de totales, la fila de origen.
export default function ConsultationLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="mb-6 h-5 w-56 max-w-full" />
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
