import { Plus, Trash2 } from "lucide-react";
import { Button as PrimitiveButton, buttonVariants } from "@/components/primitives/button";
import { SubmitButton } from "@/components/submit-button";
import { Button, ButtonLink } from "@/components/ui";
import { DemoLabel, DemoSection } from "./section";

const appVariants = ["primary", "tinted", "secondary", "ghost", "plain", "danger", "link"] as const;
const appSizes = ["sm", "md", "lg"] as const;
const primitiveVariants = ["default", "tinted", "secondary", "outline", "ghost", "plain", "destructive-tinted", "destructive", "link"] as const;

export function ButtonsSection() {
  return (
    <DemoSection
      id="botones"
      index={6}
      title="Botones"
      description="Mantené presionado sin soltar: el botón responde en el pointer-down (escala 0,97 y tono). Arrastrá afuera con el mouse: vuelve. Con Tab, el anillo azul sigue el radio."
    >
      <div className="space-y-8">
        <div>
          <DemoLabel>{"<Button> de components/ui.tsx: variante × tamaño"}</DemoLabel>
          <div className="overflow-x-auto rounded-xl bg-card p-5 shadow-card">
            <table className="text-left">
              <thead>
                <tr>
                  <th className="pb-3 pr-6 text-footnote font-semibold text-muted-foreground">variant</th>
                  {appSizes.map((s) => (
                    <th key={s} className="pb-3 pr-6 text-footnote font-semibold text-muted-foreground">
                      size=&quot;{s}&quot;
                    </th>
                  ))}
                  <th className="pb-3 text-footnote font-semibold text-muted-foreground">disabled · loading</th>
                </tr>
              </thead>
              <tbody>
                {appVariants.map((v) => (
                  <tr key={v}>
                    <td className="py-2 pr-6 text-footnote font-semibold">{v}</td>
                    {appSizes.map((s) => (
                      <td key={s} className="py-2 pr-6">
                        <Button variant={v} size={s}>
                          {v === "danger" ? <Trash2 aria-hidden /> : null}
                          {v === "danger" ? "Borrar" : "Guardar"}
                        </Button>
                      </td>
                    ))}
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Button variant={v} disabled>
                          Guardar
                        </Button>
                        <Button variant={v} loading>
                          Guardando…
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <DemoLabel>{"buttonVariants() del primitivo (incluye destructive lleno: solo para la confirmación final)"}</DemoLabel>
          <div className="flex flex-wrap gap-2 rounded-xl bg-card p-5 shadow-card">
            {primitiveVariants.map((v) => (
              <PrimitiveButton key={v} variant={v}>
                {v}
              </PrimitiveButton>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <DemoLabel>Solo ícono (icon-sm · icon · icon-lg)</DemoLabel>
            <div className="flex items-center gap-2 rounded-xl bg-card p-5 shadow-card">
              <PrimitiveButton size="icon-sm" variant="ghost" aria-label="Agregar">
                <Plus />
              </PrimitiveButton>
              <PrimitiveButton size="icon" variant="secondary" aria-label="Agregar">
                <Plus />
              </PrimitiveButton>
              <PrimitiveButton size="icon-lg" variant="tinted" aria-label="Agregar">
                <Plus />
              </PrimitiveButton>
              <PrimitiveButton size="icon" variant="destructive-tinted" aria-label="Borrar">
                <Trash2 />
              </PrimitiveButton>
            </div>
          </div>
          <div>
            <DemoLabel>ButtonLink, SubmitButton y un link suelto con buttonVariants</DemoLabel>
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-5 shadow-card">
              <ButtonLink href="#botones">ButtonLink</ButtonLink>
              <ButtonLink href="#botones" variant="secondary">
                Secundario
              </ButtonLink>
              <form>
                <SubmitButton variant="tinted" pendingLabel="Enviando…">
                  SubmitButton
                </SubmitButton>
              </form>
              <a href="#botones" className={buttonVariants({ variant: "plain", size: "sm" })}>
                Plain sm
              </a>
            </div>
          </div>
        </div>
      </div>
    </DemoSection>
  );
}
