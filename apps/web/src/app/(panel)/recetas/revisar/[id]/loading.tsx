import { Skeleton } from "@/components/primitives/skeleton";

export default function RevisarBorradorLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando borrador…</span>
      <Skeleton className="mb-6 h-16 w-full rounded-xl" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="aspect-[3/4] w-full rounded-xl" />
        </div>
        <div className="space-y-6">
          <div className="flex gap-3">
            <Skeleton className="aspect-[4/3] w-[120px] rounded-lg" />
            <Skeleton className="aspect-[4/3] w-[120px] rounded-lg" />
          </div>
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
