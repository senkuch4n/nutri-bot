import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDismissDrag, type DragValue } from "./dismiss-drag";
import { runExit, SHEET_EXIT_TIMEOUT_MS, type ExitAnimation } from "./sheet-exit";

/** Animación que se resuelve a mano (o nunca). */
function fakeAnimation() {
  let resolve: () => void = () => {};
  const anim: ExitAnimation & { stopped: boolean; resolve: () => void } = {
    stopped: false,
    then(cb) {
      resolve = cb;
      return undefined;
    },
    stop() {
      anim.stopped = true;
    },
    resolve: () => resolve(),
  };
  return anim;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("runExit", () => {
  it("desmonta cuando termina la animación, una sola vez", () => {
    const anim = fakeAnimation();
    const onDone = vi.fn();
    runExit({ start: () => anim, finalize: vi.fn(), onDone });
    anim.resolve();
    vi.advanceTimersByTime(SHEET_EXIT_TIMEOUT_MS * 2);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(anim.stopped).toBe(false);
  });

  it("si la animación no termina nunca (cuadros pausados, alguien la frenó), desmonta igual al tope", () => {
    const anim = fakeAnimation();
    const onDone = vi.fn();
    const finalize = vi.fn();
    runExit({ start: () => anim, finalize, onDone });
    vi.advanceTimersByTime(SHEET_EXIT_TIMEOUT_MS - 1);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(anim.stopped).toBe(true);
    expect(finalize).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledOnce();
    anim.resolve(); // si resuelve tarde, no se llama dos veces
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("reabrir a mitad de la salida cancela: no desmonta", () => {
    const anim = fakeAnimation();
    const onDone = vi.fn();
    const cancel = runExit({ start: () => anim, finalize: vi.fn(), onDone });
    cancel();
    anim.resolve();
    vi.advanceTimersByTime(SHEET_EXIT_TIMEOUT_MS * 2);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("evento sin captura durante la entrada y después cerrar → se desmonta", () => {
  it("toque/rueda/scroll en la entrada no frenan nada y la salida posterior termina", () => {
    // Valor del sheet a mitad de la entrada (px hacia el borde de cierre).
    let v = 180;
    let stops = 0;
    const value: DragValue = { get: () => v, set: (n) => (v = n), stop: () => (stops += 1), getVelocity: () => 0 };
    let present = true;
    const drag = createDismissDrag({
      side: "left",
      value,
      handleOnly: false,
      isEnabled: () => present,
      onDismiss: vi.fn(),
      onRestore: vi.fn(),
    });
    // Durante la entrada: un toque y un gesto vertical (scroll), sin captura.
    drag.down({ pointerId: 1, button: 0, pointerType: "touch", clientX: 120, clientY: 500, fromHandle: false, ignored: false, size: 320 });
    drag.move({ pointerId: 1, clientX: 121, clientY: 440 });
    drag.up({ pointerId: 1 }, true);
    // Movimientos del mouse sin botón (la rueda no genera pointerdown): se ignoran.
    drag.move({ pointerId: 7, clientX: 130, clientY: 520 });
    expect(stops).toBe(0);

    // Cerrar (Esc): el sheet deja de estar presente y arranca la salida.
    present = false;
    const anim = fakeAnimation();
    const onDone = vi.fn();
    runExit({ start: () => anim, finalize: () => (v = 320), onDone });
    // Un gesto que empieza durante la salida tampoco la frena.
    drag.down({ pointerId: 2, button: 0, pointerType: "touch", clientX: 120, clientY: 500, fromHandle: false, ignored: false, size: 320 });
    drag.move({ pointerId: 2, clientX: 60, clientY: 500 });
    expect(stops).toBe(0);
    // Aunque la animación no avance, el sheet se desmonta.
    vi.advanceTimersByTime(SHEET_EXIT_TIMEOUT_MS);
    expect(onDone).toHaveBeenCalledOnce();
    expect(v).toBe(320);
  });
});
