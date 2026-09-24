import { cn } from "@/lib/utils";

/**
 * Marca: glifo + "NutriBot" y, opcionalmente, el nombre de la nutricionista debajo (D13).
 * `compact` deja solo el glifo con el nombre en sr-only (sidebar colapsada).
 */
export function Wordmark({
  className,
  subtitle,
  compact = false,
}: {
  className?: string;
  subtitle?: string | null;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <LeafMark className="h-5 w-5 shrink-0 text-foreground" />
      {compact ? (
        <span className="sr-only">NutriBot</span>
      ) : (
        <span className="min-w-0 leading-tight">
          <span className="block text-sm font-semibold text-foreground">NutriBot</span>
          {subtitle ? (
            <span className="block truncate text-xs text-muted-foreground" title={subtitle}>
              {subtitle}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}

/** Glifo monocromo: toma el color del texto; el nervio usa el color de fondo. */
export function LeafMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M21 3c0 9-4.5 15-13 15-2.2 0-3.8-.5-5-1.3C4.5 8.5 11 3 21 3Z" fill="currentColor" />
      <path
        d="M4 21C6 14 10 9 18 6"
        className="stroke-background"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Los hex son los colores oficiales de Google. */
export function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", className)} aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
