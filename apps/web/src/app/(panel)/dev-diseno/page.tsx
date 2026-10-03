import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonsSection } from "./_sections/buttons";
import { CalendarSection } from "./_sections/calendar";
import { ChartSection } from "./_sections/chart";
import { ColorsSection } from "./_sections/colors";
import { ContentSection } from "./_sections/content";
import { DemoFrame, type DemoAnchor } from "./_sections/demo-frame";
import { FormsSection } from "./_sections/forms";
import { ListsSection } from "./_sections/lists";
import { MaterialsSection } from "./_sections/materials";
import { MotionSection } from "./_sections/motion";
import { OverlaysSection } from "./_sections/overlays";
import { SelectionSection } from "./_sections/selection";
import { ShapeSection } from "./_sections/shape";
import { StatesSection } from "./_sections/states";
import { TypographySection } from "./_sections/typography";

export const metadata: Metadata = { title: "Demo de diseño", robots: { index: false, follow: false } };

const anchors: DemoAnchor[] = [
  { id: "colores", label: "Color" },
  { id: "tipografia", label: "Tipografía" },
  { id: "forma", label: "Forma" },
  { id: "materiales", label: "Materiales" },
  { id: "movimiento", label: "Movimiento" },
  { id: "botones", label: "Botones" },
  { id: "formularios", label: "Formularios" },
  { id: "seleccion", label: "Selección" },
  { id: "contenido", label: "Contenido" },
  { id: "listas", label: "Listas" },
  { id: "overlays", label: "Overlays" },
  { id: "estados", label: "Estados" },
  { id: "calendario", label: "Calendario" },
  { id: "graficos", label: "Gráficos" },
];

/** Demo interna del lenguaje Apple (HU-017a, D12). Solo en desarrollo; no aparece en ninguna navegación. */
export default function DevDisenoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <DemoFrame anchors={anchors}>
      <ColorsSection />
      <TypographySection />
      <ShapeSection />
      <MaterialsSection />
      <MotionSection />
      <ButtonsSection />
      <FormsSection />
      <SelectionSection />
      <ContentSection />
      <ListsSection />
      <OverlaysSection />
      <StatesSection />
      <CalendarSection />
      <ChartSection />
    </DemoFrame>
  );
}
