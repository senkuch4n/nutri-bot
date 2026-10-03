import { Skeleton } from "@/components/primitives/skeleton";

function Loading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">Cargando…</span>
      {children}
    </div>
  );
}

/** Con `bare`, el esqueleto no anuncia nada: lo hace el contenedor que lo anida. */
function Wrapper({
  bare,
  children,
  className,
}: {
  bare?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (bare) return <div className={className}>{children}</div>;
  return <Loading className={className}>{children}</Loading>;
}

/** Encabezado + 2 bloques. Es el `loading.tsx` genérico del panel y del portal. */
export function PageSkeleton() {
  return (
    <Loading className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <CardSkeleton lines={4} bare />
        <CardSkeleton lines={4} bare />
      </div>
    </Loading>
  );
}

export function TableSkeleton({
  rows = 6,
  columns = 4,
  bare,
}: {
  rows?: number;
  columns?: number;
  bare?: boolean;
}) {
  return (
    <Wrapper bare={bare} className="overflow-hidden rounded-xl bg-card shadow-card">
      <div className="flex gap-6 border-b border-border px-3 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-6 border-b border-border px-3 py-3.5 last:border-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </Wrapper>
  );
}

export function CardSkeleton({ lines = 3, bare }: { lines?: number; bare?: boolean }) {
  return (
    <Wrapper bare={bare} className="rounded-xl bg-card p-6 shadow-card">
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${100 - (i % 3) * 15}%` }} />
        ))}
      </div>
    </Wrapper>
  );
}
