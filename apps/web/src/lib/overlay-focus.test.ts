import { afterEach, describe, expect, it, vi } from "vitest";
import { preserveUserFocusOnClose, shouldKeepUserFocus } from "./overlay-focus";

const body = { tag: "body" } as unknown as Element;
const html = { tag: "html" } as unknown as Element;
const pageButton = { tag: "button" } as unknown as Element;
const doc = { body, documentElement: html };

describe("shouldKeepUserFocus", () => {
  it("sin foco elegido (body, html o null): se devuelve el foco al disparador", () => {
    expect(shouldKeepUserFocus(null, doc)).toBe(false);
    expect(shouldKeepUserFocus(body, doc)).toBe(false);
    expect(shouldKeepUserFocus(html, doc)).toBe(false);
  });
  it("el usuario tocó o tabuló a otro elemento durante la salida: se respeta", () => {
    expect(shouldKeepUserFocus(pageButton, doc)).toBe(true);
  });
  it("el foco sigue dentro del overlay: se devuelve al disparador", () => {
    expect(shouldKeepUserFocus(pageButton, doc, { contains: () => true })).toBe(false);
  });
});

function fakeEvent(): Event {
  const e = { defaultPrevented: false, preventDefault: () => (e.defaultPrevented = true) };
  return e as unknown as Event;
}

describe("preserveUserFocusOnClose", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("previene la devolución automática si el foco está en algo que eligió el usuario", () => {
    vi.stubGlobal("document", { body, documentElement: html, activeElement: pageButton });
    const e = fakeEvent();
    preserveUserFocusOnClose(undefined)(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("no la previene si el foco quedó en body (el contenido se desmontó con el foco adentro)", () => {
    vi.stubGlobal("document", { body, documentElement: html, activeElement: body });
    const e = fakeEvent();
    preserveUserFocusOnClose(undefined)(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it("corre primero el handler del consumidor y respeta su preventDefault", () => {
    vi.stubGlobal("document", { body, documentElement: html, activeElement: body });
    const handler = vi.fn((ev: Event) => ev.preventDefault());
    const e = fakeEvent();
    preserveUserFocusOnClose(handler)(e);
    expect(handler).toHaveBeenCalledOnce();
    expect(e.defaultPrevented).toBe(true);
  });
});
