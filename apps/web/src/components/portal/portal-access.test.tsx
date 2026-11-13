import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PortalAccessScreen } from "./portal-access";

function render(props: Partial<Parameters<typeof PortalAccessScreen>[0]> = {}) {
  return renderToStaticMarkup(
    <PortalAccessScreen variant="no-link" professionalName={null} whatsappUrl={null} {...props} />,
  );
}

describe("PortalAccessScreen", () => {
  it("link vencido: dice que venció y no muestra el texto de sin link", () => {
    const html = render({ variant: "expired" });
    expect(html).toContain("Este link ya venció");
    expect(html).toContain("cada link dura 15 minutos");
    expect(html).not.toContain("Para entrar necesitás un link");
  });

  it("sin link: pide un link y resalta la palabra portal", () => {
    const html = render({ variant: "no-link" });
    expect(html).toContain("Para entrar necesitás un link");
    expect(html).toMatch(/<strong[^>]*>portal<\/strong>/);
    expect(html).not.toContain("Este link ya venció");
  });

  it("con teléfono: link a WhatsApp que se abre en otra pestaña", () => {
    const html = render({ variant: "expired", whatsappUrl: "https://wa.me/5493515552345" });
    expect(html).toContain('href="https://wa.me/5493515552345"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Escribir por WhatsApp");
  });

  it("sin teléfono: no hay botón de WhatsApp", () => {
    expect(render({ variant: "no-link" })).not.toContain("wa.me");
    expect(render({ variant: "expired" })).not.toContain("wa.me");
  });

  it("el título tiene un id fijo y la caja lo usa como nombre", () => {
    const html = render();
    expect(html).toMatch(/<h1[^>]*id="portal-access-title"/);
    expect(html).toContain('aria-labelledby="portal-access-title"');
  });
});
