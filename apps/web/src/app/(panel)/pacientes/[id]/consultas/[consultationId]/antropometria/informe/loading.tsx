import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

// Mismo patrón que el loading del estudio ISAK: encabezado y secciones en Card.
export default function IsakReportLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="space-y-6">
        <CardSkeleton lines={4} bare />
        <CardSkeleton lines={6} bare />
        <CardSkeleton lines={6} bare />
        <CardSkeleton lines={4} bare />
      </div>
    </div>
  );
}
