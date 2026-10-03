import { describe, expect, it, vi } from "vitest";
import { createDismissDrag, type DragPointerDown, type DragValue } from "./dismiss-drag";

/** Valor falso que registra si alguien detuvo la animación. */
function fakeValue(initial: number, velocity = 0) {
  let v = initial;
  const value: DragValue & { stops: number } = {
    stops: 0,
    get: () => v,
    set: (n) => {
      v = n;
    },
    stop() {
      value.stops += 1;
    },
    getVelocity: () => velocity,
  };
  return value;
}

const SIZE = 300;
const down = (patch: Partial<DragPointerDown> = {}): DragPointerDown => ({
  pointerId: 1,
  button: 0,
  pointerType: "touch",
  clientX: 100,
  clientY: 100,
  fromHandle: false,
  ignored: false,
  size: SIZE,
  ...patch,
});

function setup(opts: { initial?: number; velocity?: number; enabled?: boolean; side?: "left" | "right" | "bottom"; handleOnly?: boolean } = {}) {
  const value = fakeValue(opts.initial ?? 0, opts.velocity ?? 0);
  let enabled = opts.enabled ?? true;
  const onDismiss = vi.fn();
  const onRestore = vi.fn();
  const drag = createDismissDrag({
    side: opts.side ?? "right",
    value,
    handleOnly: opts.handleOnly ?? false,
    isEnabled: () => enabled,
    onDismiss,
    onRestore,
  });
  return { value, drag, onDismiss, onRestore, setEnabled: (e: boolean) => (enabled = e) };
}

describe("createDismissDrag: un toque o un scroll no frenan la animación", () => {
  it("pointerdown + pointerup sin moverse: no detiene nada ni llama callbacks", () => {
    const { value, drag, onDismiss, onRestore } = setup({ initial: 150 });
    drag.down(down());
    expect(drag.up({ pointerId: 1 }, false)).toBe(false);
    expect(value.stops).toBe(0);
    expect(value.get()).toBe(150);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("movimiento menor a la histéresis: sigue sin detener", () => {
    const { value, drag } = setup({ initial: 150 });
    drag.down(down());
    expect(drag.move({ pointerId: 1, clientX: 106, clientY: 103 })).toBeNull();
    expect(value.stops).toBe(0);
    expect(value.get()).toBe(150);
  });

  it("scroll vertical en un sheet lateral (gana el eje cruzado): no detiene y abandona el gesto", () => {
    const { value, drag } = setup({ initial: 150 });
    drag.down(down());
    expect(drag.move({ pointerId: 1, clientX: 102, clientY: 140 })).toBeNull();
    expect(drag.move({ pointerId: 1, clientX: 200, clientY: 140 })).toBeNull(); // ya abandonado
    expect(value.stops).toBe(0);
    expect(value.get()).toBe(150);
    expect(drag.up({ pointerId: 1 }, false)).toBe(false);
  });

  it("pointercancel sin captura (el navegador tomó el scroll): no hace nada", () => {
    const { value, drag, onRestore } = setup({ initial: 80 });
    drag.down(down());
    expect(drag.up({ pointerId: 1 }, true)).toBe(false);
    expect(value.stops).toBe(0);
    expect(onRestore).not.toHaveBeenCalled();
  });
});

describe("createDismissDrag: arrastre real", () => {
  it("al capturar detiene la animación y parte del valor presente (agarrar en vuelo)", () => {
    const { value, drag } = setup({ initial: 120 });
    drag.down(down());
    expect(drag.move({ pointerId: 1, clientX: 115, clientY: 101 })).toBe("capture");
    expect(value.stops).toBe(1);
    expect(value.get()).toBe(120); // sin salto por la histéresis
    expect(drag.move({ pointerId: 1, clientX: 145, clientY: 101 })).toBeNull();
    expect(value.get()).toBe(150); // 1:1
    expect(drag.isDragging()).toBe(true);
  });

  it("hacia adentro resiste con rubber-band", () => {
    const { value, drag } = setup({ initial: 0 });
    drag.down(down());
    drag.move({ pointerId: 1, clientX: 85, clientY: 100 }); // captura (hacia adentro en un sheet derecho)
    drag.move({ pointerId: 1, clientX: 35, clientY: 100 });
    expect(value.get()).toBeLessThan(0);
    expect(value.get()).toBeGreaterThan(-50);
  });

  it("soltar lejos cierra; soltar cerca vuelve", () => {
    const far = setup({ initial: 0 });
    far.drag.down(down());
    far.drag.move({ pointerId: 1, clientX: 115, clientY: 100 });
    far.drag.move({ pointerId: 1, clientX: 315, clientY: 100 });
    expect(far.drag.up({ pointerId: 1 }, false)).toBe(true);
    expect(far.onDismiss).toHaveBeenCalledWith(0);

    const near = setup({ initial: 0 });
    near.drag.down(down());
    near.drag.move({ pointerId: 1, clientX: 115, clientY: 100 });
    near.drag.move({ pointerId: 1, clientX: 140, clientY: 100 });
    expect(near.drag.up({ pointerId: 1 }, false)).toBe(true);
    expect(near.onRestore).toHaveBeenCalledWith(0);
  });

  it("un flick hacia afuera cierra con su velocidad", () => {
    const { drag, onDismiss } = setup({ initial: 0, velocity: 900 });
    drag.down(down());
    drag.move({ pointerId: 1, clientX: 115, clientY: 100 });
    drag.up({ pointerId: 1 }, false);
    expect(onDismiss).toHaveBeenCalledWith(900);
  });

  it("sheet izquierdo: cerrar es hacia la izquierda", () => {
    const { value, drag } = setup({ side: "left" });
    drag.down(down());
    expect(drag.move({ pointerId: 1, clientX: 85, clientY: 100 })).toBe("capture");
    drag.move({ pointerId: 1, clientX: 45, clientY: 100 });
    expect(value.get()).toBe(40);
  });
});

describe("createDismissDrag: sheet saliendo o deshabilitado", () => {
  it("un gesto que empieza mientras el sheet sale se ignora por completo", () => {
    const { value, drag, onDismiss, onRestore } = setup({ initial: 200, enabled: false });
    drag.down(down());
    expect(drag.move({ pointerId: 1, clientX: 200, clientY: 100 })).toBeNull();
    expect(drag.up({ pointerId: 1 }, false)).toBe(false);
    expect(value.stops).toBe(0);
    expect(value.get()).toBe(200);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("si el sheet se cierra a mitad del arrastre (Esc), el gesto se abandona y no pelea con la salida", () => {
    const { value, drag, setEnabled, onRestore, onDismiss } = setup();
    drag.down(down());
    drag.move({ pointerId: 1, clientX: 140, clientY: 100 });
    setEnabled(false);
    const before = value.get();
    drag.move({ pointerId: 1, clientX: 200, clientY: 100 });
    expect(value.get()).toBe(before);
    drag.up({ pointerId: 1 }, false);
    expect(onRestore).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("si se cierra después de capturar y se suelta sin mover, tampoco restaura", () => {
    const { drag, setEnabled, onRestore } = setup();
    drag.down(down());
    drag.move({ pointerId: 1, clientX: 140, clientY: 100 });
    setEnabled(false);
    expect(drag.up({ pointerId: 1 }, false)).toBe(true);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("con mouse solo desde el handle; inputs ignorados; otro puntero no interfiere", () => {
    const mouse = setup();
    mouse.drag.down(down({ pointerType: "mouse" }));
    expect(mouse.drag.move({ pointerId: 1, clientX: 200, clientY: 100 })).toBeNull();

    const bottom = setup({ side: "bottom", handleOnly: true });
    bottom.drag.down(down({ pointerType: "mouse", fromHandle: true }));
    expect(bottom.drag.move({ pointerId: 1, clientX: 100, clientY: 130 })).toBe("capture");

    const input = setup();
    input.drag.down(down({ ignored: true }));
    expect(input.drag.move({ pointerId: 1, clientX: 200, clientY: 100 })).toBeNull();

    const other = setup();
    other.drag.down(down());
    expect(other.drag.move({ pointerId: 2, clientX: 200, clientY: 100 })).toBeNull();
    expect(other.value.stops).toBe(0);
  });
});
