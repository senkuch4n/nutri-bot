/** Barra horizontal de −3 a +3 con el 0 marcado (HU-006). Decorativa: el Z va en texto al lado. */
export function ZScoreBar({ z }: { z: number | null }) {
  const clipped = z === null ? 0 : Math.max(-3, Math.min(3, z));
  const width = (Math.abs(clipped) / 3) * 50;
  const left = clipped < 0 ? 50 - width : 50;
  return (
    <div aria-hidden className="relative h-2 w-24 rounded-full bg-secondary">
      {z !== null ? (
        <div className="absolute inset-y-0 rounded-full bg-muted-foreground" style={{ left: `${left}%`, width: `${width}%` }} />
      ) : null}
      <div className="absolute -inset-y-0.5 left-1/2 w-px -translate-x-1/2 bg-border" />
    </div>
  );
}
