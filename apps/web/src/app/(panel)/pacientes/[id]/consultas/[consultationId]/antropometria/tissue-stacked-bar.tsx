import { formatFixedEs, type IsakStudyResult } from "@nutri-bot/core";
import { isakTissueColors } from "@/lib/chart-theme";

const PARTS = [
  { key: "adipose", label: "Adiposo" },
  { key: "muscle", label: "Muscular" },
  { key: "bone", label: "Óseo" },
  { key: "residual", label: "Residual" },
] as const;

/** Barra apilada de los 4 tejidos en % (HU-006). Solo si los 4 están ok y ninguno es negativo. */
export function TissueStackedBar({ tissues }: { tissues: IsakStudyResult["tissues"] }) {
  const parts = PARTS.map((p) => {
    const percent = tissues[p.key].percent;
    return { ...p, percent: percent.status === "ok" ? percent.value : null, color: isakTissueColors[p.key] };
  });
  if (parts.some((p) => p.percent === null || p.percent < 0)) return null;

  return (
    <figure className="mt-4 space-y-3" aria-label="Fraccionamiento tisular en %">
      {/* La barra es decorativa: los mismos valores van en texto en la leyenda. */}
      {/* HU-017c-3: entrada corta (fundido + leve desplazamiento, 300 ms); nada con movimiento reducido. */}
      <div
        aria-hidden
        className="flex h-3 overflow-hidden rounded-full motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2"
      >
        {parts.map((p) => (
          <div key={p.key} className="h-full" style={{ width: `${p.percent}%`, backgroundColor: p.color }} />
        ))}
      </div>
      <figcaption>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-1.5 tabular-nums">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: p.color }} />
              {p.label} {formatFixedEs(p.percent as number, 2)} %
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
