// HU-020: "Textos del plan" (HTML estático, sin DOM ni base).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/(panel)/plan-section-actions", () => ({
  addPlanSectionAction: vi.fn(),
  updatePlanSectionAction: vi.fn(),
  deletePlanSectionAction: vi.fn(),
  movePlanSectionAction: vi.fn(),
}));
vi.mock("@/components/confirm", () => ({ useConfirm: () => async () => true }));

import { TooltipProvider } from "@/components/primitives/tooltip";
import { PlanSectionsEditor } from "./plan-sections-editor";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();
const render = (sections: { id: string; title: string; body: string }[], kind: "template" | "plan" = "template") =>
  renderToStaticMarkup(
    <TooltipProvider>
      <PlanSectionsEditor kind={kind} ownerId="o1" sections={sections} />
    </TooltipProvider>,
  );

describe("PlanSectionsEditor", () => {
  it("vacío: texto de vacío y botón Agregar texto", () => {
    const t = text(render([]));
    expect(t).toContain("Textos del plan");
    expect(t).toContain("Todavía no hay textos. Sumá recomendaciones, porciones diarias o reemplazos.");
    expect(t).toContain("Agregar texto");
    expect(t).toContain("Se copian al plan cuando aplicás la plantilla.");
  });

  it("muestra título y cuerpo con sus saltos de línea", () => {
    const html = render([{ id: "s1", title: "Recomendaciones", body: "Tomar agua\nCaminar" }], "plan");
    expect(html).toContain("Recomendaciones");
    expect(html).toContain("Tomar agua\nCaminar");
    expect(html).toContain("whitespace-pre-line");
    expect(text(html)).toContain("Tu paciente los ve en el portal y en el PDF.");
  });

  it("con 30 textos el botón se deshabilita y explica por qué", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, title: `T${i}`, body: "x" }));
    const html = render(many);
    expect(text(html)).toContain("Llegaste al máximo de 30 textos.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="[^"]+"/);
  });
});
