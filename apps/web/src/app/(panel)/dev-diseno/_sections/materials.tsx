import { colors } from "@/lib/design-tokens";
import { DemoSection } from "./section";

// Fondo "difícil" con gradientes CSS (sin imágenes): franjas negras, tint y rojo bajo los materiales.
const hardBackground = {
  backgroundImage: [
    `repeating-linear-gradient(135deg, ${colors.overlay} 0 1.5rem, transparent 1.5rem 3rem)`,
    `linear-gradient(180deg, ${colors.primary}, ${colors.destructive} 50%, ${colors.success})`,
  ].join(", "),
};

const rows = Array.from({ length: 18 }, (_, i) => i);

export function MaterialsSection() {
  return (
    <DemoSection
      id="materiales"
      index={4}
      title="Materiales"
      description="Translúcidos solo en el chrome (topbar, header y tab bar del portal) y en superficies flotantes chicas. Scrolleá la caja: el contenido pasa difuminado por debajo y el texto sigue legible (variantes vibrant)."
    >
      <div className="relative h-[26rem] overflow-y-auto rounded-2xl shadow-card" tabIndex={0} aria-label="Ejemplo de materiales, desplazable">
        <div className="material-chrome sticky top-0 z-10 flex h-14 items-center justify-between px-4" data-scrolled="true">
          <div>
            <p className="text-callout font-semibold text-foreground">material-chrome · 80 %</p>
            <p className="text-footnote font-medium text-muted-foreground">Texto secundario (vibrant)</p>
          </div>
          <p className="text-callout font-semibold text-primary-vibrant">Acción</p>
        </div>

        <div style={hardBackground} className="space-y-3 px-4 py-6">
          {rows.map((i) => (
            <div key={i} className="h-8 w-2/3 rounded-md bg-background/60" />
          ))}
        </div>

        <div className="pointer-events-none sticky bottom-20 z-10 flex justify-end px-4">
          <div className="material-float w-64 rounded-lg p-4">
            <p className="text-callout font-semibold text-foreground">material-float · 85 %</p>
            <p className="mt-1 text-footnote font-medium text-muted-foreground">Popovers, menús y toasts</p>
            <p className="mt-1 text-footnote font-semibold text-destructive">Borrar (destructive-vibrant)</p>
          </div>
        </div>

        <div className="material-bar sticky bottom-0 z-10 grid h-14 grid-cols-3 items-center text-center">
          <p className="text-caption font-semibold text-primary-vibrant">Activa</p>
          <p className="text-caption font-medium text-muted-foreground">Reposo</p>
          <p className="text-caption font-medium text-muted-foreground">material-bar · 85 %</p>
        </div>
      </div>
    </DemoSection>
  );
}
