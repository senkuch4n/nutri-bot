import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ColorsSection } from "./_sections/colors";
import { DemoFrame, type DemoAnchor } from "./_sections/demo-frame";
import { MaterialsSection } from "./_sections/materials";
import { MotionSection } from "./_sections/motion";
import { ShapeSection } from "./_sections/shape";
import { TypographySection } from "./_sections/typography";

export const metadata: Metadata = { title: "Demo de diseño", robots: { index: false, follow: false } };

const anchors: DemoAnchor[] = [
  { id: "colores", label: "Color" },
  { id: "tipografia", label: "Tipografía" },
  { id: "forma", label: "Forma" },
  { id: "materiales", label: "Materiales" },
  { id: "movimiento", label: "Movimiento" },
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
    </DemoFrame>
  );
}
