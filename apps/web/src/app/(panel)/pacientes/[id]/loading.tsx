import { Skeleton } from "@/components/primitives/skeleton";
import { GroupedListSkeleton } from "@/components/skeletons";

/** Carga de la ficha (HU-017c-2): misma estructura que el Resumen (encabezado en su panel tintado,
 *  pestañas en píldora y el contenido en su panel), para que no salte al llegar los datos. */
export default function PatientLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="mt-2 space-y-3 rounded-[1.75rem] bg-[#f6f5f8] p-5 sm:p-7">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>
      <div className="mt-6 grid h-12 grid-cols-4 items-center gap-1 sm:flex sm:gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-full sm:w-24" />
        ))}
      </div>
      <div className="mt-4 space-y-6 rounded-[1.75rem] border border-black/[0.05] bg-[#fcfbfd] p-5 sm:p-7">
        <Skeleton className="h-11 w-full rounded-lg sm:w-48" />
        <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <GroupedListSkeleton rows={6} bare />
          </div>
        </div>
      </div>
    </div>
  );
}
