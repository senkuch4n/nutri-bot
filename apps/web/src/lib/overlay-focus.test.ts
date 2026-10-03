import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyExitGuard,
  ignoreOutsideBeforeOpen,
  preserveUserFocusOnClose,
  restoreFocus,
  shouldKeepUserFocus,
  startedBeforeOpen,
} from "./overlay-focus";

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

describe("applyExitGuard (cerrar y reabrir a mitad de la salida)", () => {
  function fakeContainer(children: Element[]) {
    return { inert: false, contains: (n: Element) => children.includes(n) };
  }

  it("al salir: inert y saca el foco si estaba adentro", () => {
    const blur = vi.fn();
    const inside = { blur } as unknown as Element & { blur: () => void };
    const c = fakeContainer([inside]);
    applyExitGuard(c, false, inside);
    expect(c.inert).toBe(true);
    expect(blur).toHaveBeenCalledOnce();
  });

  it("al salir con el foco afuera: inert, pero no toca el foco del usuario", () => {
    const blur = vi.fn();
    const outside = { blur } as unknown as Element & { blur: () => void };
    const c = fakeContainer([]);
    applyExitGuard(c, false, outside);
    expect(c.inert).toBe(true);
    expect(blur).not.toHaveBeenCalled();
  });

  it("reabierto durante la salida (misma instancia vuelve a estar presente): deja de ser inert", () => {
    const c = fakeContainer([]);
    applyExitGuard(c, false, null); // Esc
    expect(c.inert).toBe(true);
    applyExitGuard(c, true, null); // clic en el disparador antes de que termine la salida
    expect(c.inert).toBe(false);
  });
});

describe("devolver el foco al elemento que abrió el overlay (overlays sin Trigger de Radix)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const opener = () => {
    const el = { isConnected: true, focus: vi.fn() };
    return el;
  };

  it("restoreFocus: si el foco quedó en body y el disparador sigue en el documento, lo enfoca", () => {
    const btn = opener();
    expect(restoreFocus(btn, { activeElement: body, body, documentElement: html })).toBe(true);
    expect(btn.focus).toHaveBeenCalledOnce();
  });

  it("restoreFocus: no pisa un foco real (Radix ya enfocó su Trigger, o el usuario eligió otro)", () => {
    const btn = opener();
    expect(restoreFocus(btn, { activeElement: pageButton, body, documentElement: html })).toBe(false);
    expect(btn.focus).not.toHaveBeenCalled();
  });

  it("restoreFocus: si el disparador ya no está (p. ej. se borró la fila), no hace nada", () => {
    const btn = { isConnected: false, focus: vi.fn() };
    expect(restoreFocus(btn, { activeElement: body, body, documentElement: html })).toBe(false);
    expect(btn.focus).not.toHaveBeenCalled();
  });

  it("Esc en un Modal/useConfirm/sheet controlado: después de Radix (sin trigger, foco en body) vuelve al botón", () => {
    const doc = { body, documentElement: html, activeElement: body as Element };
    vi.stubGlobal("document", doc);
    const btn = opener();
    const queued: Array<() => void> = [];
    const e = fakeEvent();
    preserveUserFocusOnClose(undefined, { returnTo: () => btn, schedule: (fn) => queued.push(fn) })(e);
    expect(e.defaultPrevented).toBe(false); // Radix sigue con lo suyo (enfocar su trigger, que no existe)
    queued.forEach((fn) => fn());
    expect(btn.focus).toHaveBeenCalledOnce();
  });

  it("si durante la salida el usuario tocó otro control, no se le devuelve el foco al botón", () => {
    vi.stubGlobal("document", { body, documentElement: html, activeElement: pageButton });
    const btn = opener();
    const queued: Array<() => void> = [];
    const e = fakeEvent();
    preserveUserFocusOnClose(undefined, { returnTo: () => btn, schedule: (fn) => queued.push(fn) })(e);
    expect(e.defaultPrevented).toBe(true);
    expect(queued).toHaveLength(0);
    expect(btn.focus).not.toHaveBeenCalled();
  });

  it("con Trigger de Radix: Radix ya lo enfocó, la devolución no hace nada", () => {
    const doc = { body, documentElement: html, activeElement: body as Element };
    vi.stubGlobal("document", doc);
    const btn = opener();
    const queued: Array<() => void> = [];
    preserveUserFocusOnClose(undefined, { returnTo: () => btn, schedule: (fn) => queued.push(fn) })(fakeEvent());
    doc.activeElement = pageButton; // Radix enfocó su Trigger en el mismo evento
    queued.forEach((fn) => fn());
    expect(btn.focus).not.toHaveBeenCalled();
  });
});

describe("interacción afuera que empezó antes de (re)abrir", () => {
  it("startedBeforeOpen compara el timeStamp del pointerdown con la apertura", () => {
    expect(startedBeforeOpen(100, 150)).toBe(true); // el toque que reabrió durante la salida
    expect(startedBeforeOpen(200, 150)).toBe(false); // un clic afuera real, con el overlay abierto
    expect(startedBeforeOpen(undefined, 150)).toBe(false);
  });

  function outsideEvent(timeStamp: number) {
    const e = { defaultPrevented: false, detail: { originalEvent: { timeStamp } }, preventDefault: () => (e.defaultPrevented = true) };
    return e as unknown as CustomEvent<{ originalEvent: Event }>;
  }

  it("ignoreOutsideBeforeOpen: previene el cierre si el toque fue anterior a la reapertura", () => {
    const handler = vi.fn();
    const e = outsideEvent(100);
    ignoreOutsideBeforeOpen(handler, () => 150)(e);
    expect(e.defaultPrevented).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it("ignoreOutsideBeforeOpen: un clic afuera posterior sigue cerrando (y pasa por el handler del consumidor)", () => {
    const handler = vi.fn();
    const e = outsideEvent(200);
    ignoreOutsideBeforeOpen(handler, () => 150)(e);
    expect(e.defaultPrevented).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
  });
});
