import { Skeleton } from "@/components/primitives/skeleton";
import { CardSkeleton } from "@/components/skeletons";

/** Sin este archivo, /ajustes/whatsapp mostraría el esqueleto de pestañas de /ajustes. */
export default function WhatsAppLoading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="mb-3 h-4 w-32" />
      <div className="mb-8 space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="max-w-3xl">
        <CardSkeleton bare lines={4} />
      </div>
    </div>
  );
}
