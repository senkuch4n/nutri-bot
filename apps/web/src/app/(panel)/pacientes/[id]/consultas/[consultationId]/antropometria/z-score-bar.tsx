import { cn } from "@/lib/utils";

/**
 * Barra horizontal de −3 a +3 con el 0 marcado (HU-006; HU-017c-3). Relleno con color suave según la
 * zona (hasta ±2 el tint suave, más allá el aviso suave) y los extremos rotulados "bajo" y "alto", así no
 * depende solo del color. El valor de Z va en texto en la columna de al lado.
 */
export function ZScoreBar({ z }: { z: number | null }) {
  // Sin dato: no hay barra (la columna de Z ya dice "Sin dato").
  if (z === null) return null;
  const clipped = Math.max(-3, Math.min(3, z));
  const width = (Math.abs(clipped) / 3) * 50;
  const left = clipped < 0 ? 50 - width : 50;
  const far = Math.abs(z) > 2;
  return (
    <div className="flex items-center gap-1.5 text-footnote text-muted-foreground" aria-hidden>
      <span>bajo</span>
      <div className="relative h-2 w-24 shrink-0 rounded-full bg-secondary">
        <div
          className={cn("absolute inset-y-0 rounded-full", far ? "bg-warning/45" : "bg-primary/35")}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <div className="absolute -inset-y-0.5 left-1/2 w-px -translate-x-1/2 bg-muted-foreground/60" />
      </div>
      <span>alto</span>
    </div>
  );
}
