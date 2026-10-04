import { describe, expect, it, vi } from "vitest";
import { UNDO_TEXT, createDeferredDeleteStore, measurementLabelsText } from "./deferred-delete";

/** Timers manuales: el release de las keys se dispara a mano. */
function manualTimers() {
  const queue: Array<() => void> = [];
  return {
    setTimer: (fn: () => void) => {
      queue.push(fn);
    },
    flush: () => {
      for (const fn of queue.splice(0)) fn();
    },
  };
}

describe("createDeferredDeleteStore", () => {
  it("schedule oculta la key al instante y no llama a commit", () => {
    const store = createDeferredDeleteStore();
    const commit = vi.fn(async () => ({ ok: true }));
    store.schedule({ key: "isak:e1", commit });
    expect(store.isPending("isak:e1")).toBe(true);
    expect(store.getSnapshot().has("isak:e1")).toBe(true);
    expect(commit).not.toHaveBeenCalled();
  });

  it("undo antes de commit: no llama a commit, la key vuelve y devuelve true", async () => {
    const store = createDeferredDeleteStore();
    const commit = vi.fn(async () => ({ ok: true }));
    const id = store.schedule({ key: "isak:e1", commit });
    expect(store.undo(id)).toBe(true);
    expect(store.isPending("isak:e1")).toBe(false);
    // Un commit tardío (p. ej. onDismiss después de Deshacer) es no-op.
    await expect(store.commit(id)).resolves.toEqual({ ok: true });
    expect(commit).not.toHaveBeenCalled();
  });

  it("commit llama una sola vez aunque se invoque dos (onAutoClose + onDismiss)", async () => {
    const store = createDeferredDeleteStore({ setTimer: manualTimers().setTimer });
    const commit = vi.fn(async () => ({ ok: true }));
    const id = store.schedule({ key: "consultation:c1", commit });
    const [a, b] = await Promise.all([store.commit(id), store.commit(id)]);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
  });

  it("undo después de commit → false y no restaura", async () => {
    const timers = manualTimers();
    const store = createDeferredDeleteStore({ setTimer: timers.setTimer });
    const id = store.schedule({ key: "measurement:m1", commit: async () => ({ ok: true }) });
    const pending = store.commit(id);
    expect(store.undo(id)).toBe(false);
    await pending;
    expect(store.undo(id)).toBe(false);
    // Después de un commit exitoso la key queda oculta hasta el release (llega la página nueva).
    expect(store.isPending("measurement:m1")).toBe(true);
    timers.flush();
    expect(store.isPending("measurement:m1")).toBe(false);
  });

  it("commit que devuelve { ok: false } → la key vuelve y se devuelve el error", async () => {
    const store = createDeferredDeleteStore();
    const id = store.schedule({ key: "prescription:c1", commit: async () => ({ ok: false, error: "No se pudo" }) });
    await expect(store.commit(id)).resolves.toEqual({ ok: false, error: "No se pudo" });
    expect(store.isPending("prescription:c1")).toBe(false);
  });

  it("commit que tira → igual que { ok: false }", async () => {
    const store = createDeferredDeleteStore();
    const id = store.schedule({
      key: "isak:e2",
      commit: async () => {
        throw new Error("Failed to fetch");
      },
    });
    await expect(store.commit(id)).resolves.toEqual({ ok: false, error: "Failed to fetch" });
    expect(store.isPending("isak:e2")).toBe(false);
  });

  it("dos entradas con keys distintas no se pisan", async () => {
    const store = createDeferredDeleteStore({ setTimer: manualTimers().setTimer });
    const commitA = vi.fn(async () => ({ ok: true }));
    const commitB = vi.fn(async () => ({ ok: true }));
    const a = store.schedule({ key: "measurement:a", commit: commitA });
    const b = store.schedule({ key: "measurement:b", commit: commitB });
    expect(store.undo(a)).toBe(true);
    expect(store.isPending("measurement:a")).toBe(false);
    expect(store.isPending("measurement:b")).toBe(true);
    await store.commit(b);
    expect(commitA).not.toHaveBeenCalled();
    expect(commitB).toHaveBeenCalledTimes(1);
    expect([...store.getSnapshot()]).toEqual(["measurement:b"]);
  });

  it("subscribe avisa en cada cambio y la snapshot cambia de identidad", async () => {
    const store = createDeferredDeleteStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getSnapshot();
    const id = store.schedule({ key: "isak:e3", commit: async () => ({ ok: false }) });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(before);
    const scheduled = store.getSnapshot();
    expect(store.getSnapshot()).toBe(scheduled); // estable entre cambios
    await store.commit(id);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.schedule({ key: "isak:e4", commit: async () => ({ ok: true }) });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("commit de un id desconocido es no-op", async () => {
    const store = createDeferredDeleteStore();
    await expect(store.commit("nada#1")).resolves.toEqual({ ok: true });
    expect(store.undo("nada#1")).toBe(false);
  });
});

describe("UNDO_TEXT", () => {
  it("textos exactos de la HU §4.3", () => {
    expect(UNDO_TEXT.deleteError).toBe("No se pudo borrar. Probá de nuevo.");
    expect(UNDO_TEXT.undoError).toBe("No se pudo deshacer.");
    expect(UNDO_TEXT.consultation.confirmDescription("24/09")).toBe(
      "Se borra la consulta del 24/09. Solo se puede borrar si no tiene mediciones, cálculo ni plan.",
    );
    expect(UNDO_TEXT.consultation.deleted).toBe("Consulta borrada");
    expect(UNDO_TEXT.consultation.undone).toBe("Listo, la consulta volvió");
    expect(UNDO_TEXT.study.undone).toBe("Listo, el estudio volvió");
    expect(UNDO_TEXT.calculation.undone).toBe("Listo, el cálculo volvió");
    expect(UNDO_TEXT.measurement.deleted).toBe("Medición borrada");
    expect(UNDO_TEXT.measurement.undone).toBe("Listo, la medición volvió");
    expect(UNDO_TEXT.plan.removed).toBe("Plan quitado de la consulta");
    expect(UNDO_TEXT.plan.undone).toBe("Listo, el plan volvió");
  });

  it("descripción de la medición con sus valores", () => {
    expect(UNDO_TEXT.measurement.confirmDescription("24/09", ["Peso", "Cintura", "Cadera"])).toBe(
      "Se borra la medición del 24/09 (peso, cintura…).",
    );
    expect(UNDO_TEXT.measurement.confirmDescription("24/09", ["Peso"])).toBe("Se borra la medición del 24/09 (peso).");
    expect(UNDO_TEXT.measurement.confirmDescription("24/09", [])).toBe("Se borra la medición del 24/09.");
    expect(measurementLabelsText(["Peso", "Talla"])).toBe(" (peso, talla)");
  });
});
