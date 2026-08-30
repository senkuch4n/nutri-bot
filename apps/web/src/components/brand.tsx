import { cn } from "./ui";

/** Marca denominativa de NutriBot con un glifo de hoja. */
export function Wordmark({ className, tone = "ink" }: { className?: string; tone?: "ink" | "invert" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight",
        tone === "invert" ? "text-white" : "text-ink",
        className,
      )}
    >
      <LeafMark className="h-6 w-6 text-leaf" />
      NutriBot
    </span>
  );
}

export function LeafMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M21 3c0 9-4.5 15-13 15-2.2 0-3.8-.5-5-1.3C4.5 8.5 11 3 21 3Z"
        fill="currentColor"
      />
      <path
        d="M4 21C6 14 10 9 18 6"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Etiqueta "eyebrow": texto corto en mayúsculas con un tick verde. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-leaf-deep",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 bg-leaf" />
      {children}
    </span>
  );
}

/**
 * Composición geométrica al estilo spring.io: un cuarto de círculo y un
 * triángulo en dos verdes, sangrando por los bordes. Puramente decorativa.
 */
export function SpringShapes({ className }: { className?: string }) {
  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      viewBox="0 0 600 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {/* triángulo bright en la esquina inferior izquierda */}
      <path d="M0 800 V560 L250 800 Z" fill="#93cf52" />
      {/* cuarto de círculo verde profundo en la esquina superior derecha */}
      <path d="M370 0 A230 230 0 0 1 600 230 L600 0 Z" fill="#5aa832" />
      {/* círculo lineal, detalle fino */}
      <circle cx="92" cy="720" r="78" fill="none" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.55" />
    </svg>
  );
}

export function CornerTriangle({ className }: { className?: string }) {
  return (
    <svg
      className={cn("pointer-events-none absolute right-0 top-0 h-28 w-28", className)}
      viewBox="0 0 160 160"
      aria-hidden
    >
      <path d="M160 0 V160 L0 0 Z" fill="#93cf52" fillOpacity="0.45" />
    </svg>
  );
}

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
