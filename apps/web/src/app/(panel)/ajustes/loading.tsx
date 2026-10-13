import { Skeleton } from "@/components/primitives/skeleton";
import { GroupedListSkeleton } from "@/components/skeletons";

/** HU-017b-4: índice lateral desde 1024 px y la sección como listas agrupadas (en el celular, la lista). */
export default function AjustesLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <div className="hidden space-y-1 lg:block">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
        <div className="max-w-3xl space-y-8">
          <div className="lg:hidden">
            <GroupedListSkeleton rows={4} bare />
          </div>
          <div className="hidden space-y-3 lg:block">
            <Skeleton className="h-7 w-40" />
            <GroupedListSkeleton rows={4} bare />
          </div>
        </div>
      </div>
    </div>
  );
}
