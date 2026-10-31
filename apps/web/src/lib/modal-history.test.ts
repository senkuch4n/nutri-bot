import { describe, expect, it } from "vitest";
import { modalNavKeyframes, nextModalHistoryDepth } from "./modal-history";

describe("nextModalHistoryDepth (pasos dentro del modal de la ficha)", () => {
  it("cada navegación nueva (link o redirect) suma un paso", () => {
    expect(nextModalHistoryDepth(1, "push")).toBe(2);
    expect(nextModalHistoryDepth(2, "push")).toBe(3);
  });

  it("el Atrás del navegador resta un paso, sin bajar de 1 (la ficha con la que se abrió)", () => {
    expect(nextModalHistoryDepth(3, "pop")).toBe(2);
    expect(nextModalHistoryDepth(1, "pop")).toBe(1);
  });
});

describe("modalNavKeyframes (transición al navegar dentro del modal)", () => {
  it("avanzar (ficha → plan) entra desde la derecha; volver, desde la izquierda; termina nítido y en su lugar", () => {
    const push = modalNavKeyframes("push");
    const pop = modalNavKeyframes("pop");
    expect(push[0]).toMatchObject({ opacity: 0, transform: "translateX(28px)" });
    expect(pop[0]).toMatchObject({ opacity: 0, transform: "translateX(-28px)" });
    for (const frames of [push, pop]) {
      expect(frames[0]?.filter).toBe("blur(6px)");
      expect(frames.at(-1)).toEqual({ opacity: 1, transform: "none", filter: "blur(0px)" });
    }
  });
});
