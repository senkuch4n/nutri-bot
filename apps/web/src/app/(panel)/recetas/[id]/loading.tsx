import { Skeleton } from "@/components/primitives/skeleton";

export default function RecetaLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando receta…</span>
      <Skeleton className="mb-3 h-5 w-24" />
      <Skeleton className="mb-8 h-8 w-80 max-w-full" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,42rem)_20rem]">
        <div className="space-y-6">
          <Skeleton className="aspect-[4/3] w-full max-w-md rounded-xl" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-2/3" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}
