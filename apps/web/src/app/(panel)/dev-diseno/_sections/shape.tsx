import { radii } from "@/lib/design-tokens";
import { DemoLabel, DemoSection } from "./section";

const radiusSamples = [
  { className: "rounded-xs", key: "xs", use: "Badges, chips, eventos" },
  { className: "rounded-md", key: "md", use: "Inputs, botones, ítems" },
  { className: "rounded-lg", key: "lg", use: "Botones lg, popovers, alertas" },
  { className: "rounded-xl", key: "xl", use: "Tarjetas, listas agrupadas" },
  { className: "rounded-2xl", key: "2xl", use: "Sheets, dialogs, workspace" },
  { className: "rounded-full", key: "full", use: "Segmentado, switch, pills" },
] as const;

const elevations = [
  { className: "shadow-card", label: "Nivel 1 · shadow-card", use: "Tarjetas, listas, workspace" },
  { className: "shadow-float", label: "Nivel 2 · shadow-float", use: "Popovers, menús, toasts" },
  { className: "shadow-modal", label: "Nivel 3 · shadow-modal", use: "Dialog, sheet modal" },
] as const;

export function ShapeSection() {
  return (
    <DemoSection
      id="forma"
      index={3}
      title="Forma y profundidad"
      description="Radios concéntricos (interior = exterior − padding) y tres niveles de elevación. Las tarjetas no llevan borde: un anillo de 0,5 px y una sombra corta."
    >
      <div className="space-y-8">
        <div>
          <DemoLabel>Radios</DemoLabel>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {radiusSamples.map((r) => (
              <li key={r.key} className="text-center">
                <div className={`${r.className} mx-auto h-16 w-full bg-primary-soft`} />
                <p className="mt-2 text-footnote font-semibold">{r.className}</p>
                <p className="text-footnote tabular-nums text-muted-foreground">{radii[r.key]}</p>
                <p className="text-footnote text-muted-foreground">{r.use}</p>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <DemoLabel>Concéntricos: tarjeta 16 con p-2 → botón 8</DemoLabel>
          <div className="inline-flex gap-2 rounded-xl bg-card p-2 shadow-card">
            <span className="inline-flex h-9 items-center rounded-md bg-secondary px-4 text-callout font-medium">Cancelar</span>
            <span className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-callout font-medium text-primary-foreground">
              Guardar
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {[
            { label: "Sobre blanco", bg: "bg-background" },
            { label: "Sobre agrupado", bg: "bg-grouped" },
          ].map((surface) => (
            <div key={surface.label} className={`${surface.bg} rounded-2xl p-6 ring-1 ring-border`}>
              <DemoLabel>{surface.label}</DemoLabel>
              <div className="grid gap-4 sm:grid-cols-3">
                {elevations.map((e) => (
                  <div key={e.className} className={`${e.className} rounded-xl bg-card p-4`}>
                    <p className="text-callout font-semibold">{e.label}</p>
                    <p className="mt-1 text-footnote text-muted-foreground">{e.use}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DemoSection>
  );
}
