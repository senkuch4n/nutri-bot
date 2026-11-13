import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PresenceContext } from "motion/react";
import { ModalScrim } from "./modal-scrim";

function render(isPresent: boolean) {
  return renderToStaticMarkup(
    <PresenceContext.Provider
      value={{ id: "t", isPresent, register: () => () => {}, onExitComplete: () => {}, initial: false, custom: undefined }}
    >
      <ModalScrim overlay={<div data-radix-overlay="" />} />
    </PresenceContext.Provider>,
  );
}

describe("ModalScrim", () => {
  it("abierto: el scrim visual no recibe punteros y el Overlay de Radix (clics afuera + RemoveScroll) está montado", () => {
    const html = render(true);
    expect(html).toMatch(/data-scrim=""[^>]*class="[^"]*pointer-events-none/);
    expect(html).toContain("data-radix-overlay");
  });

  it("saliendo (open=false): el Overlay se desmonta y el scrim que queda haciendo el fundido no bloquea la página", () => {
    const html = render(false);
    expect(html).toMatch(/data-scrim=""[^>]*class="[^"]*pointer-events-none/);
    expect(html).not.toContain("data-radix-overlay");
  });
});
