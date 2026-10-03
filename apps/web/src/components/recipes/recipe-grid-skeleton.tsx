import { Skeleton } from "@/components/primitives/skeleton";

// HU-018a: 8 tarjetas con la foto 4:3 reservada (sin saltos de layout al cargar).

export function RecipeGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      <span className="sr-only">Cargando recetas…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl bg-card shadow-card">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}
