import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  patientTabHref,
  patientTabQuery,
  replaceUrlInRouter,
  resolvePatientTab,
  withoutSearchParam,
} from "./patient-tab-route";

describe("resolvePatientTab", () => {
  it.each([
    // Valores viejos (HU §2.2, "Los enlaces viejos siguen funcionando").
    ["resumen", null, { tab: "resumen", view: "medidas", focus: null }],
    ["consultas", null, { tab: "consultas", view: "medidas", focus: null }],
    ["datos", null, { tab: "resumen", view: "medidas", focus: "datos" }],
    ["evolucion", null, { tab: "historial", view: "medidas", focus: null }],
    ["planes", null, { tab: "planes", view: "medidas", focus: null }],
    ["diario", null, { tab: "historial", view: "diario", focus: null }],
    ["turnos", null, { tab: "historial", view: "turnos", focus: null }],
    // Nuevos.
    [null, null, { tab: "resumen", view: "medidas", focus: null }],
    ["historial", null, { tab: "historial", view: "medidas", focus: null }],
    ["historial", "turnos", { tab: "historial", view: "turnos", focus: null }],
    ["historial", "diario", { tab: "historial", view: "diario", focus: null }],
    ["historial", "medidas", { tab: "historial", view: "medidas", focus: null }],
    // Desconocidos.
    ["cualquiera", null, { tab: "resumen", view: "medidas", focus: null }],
    ["", null, { tab: "resumen", view: "medidas", focus: null }],
    ["historial", "otra", { tab: "historial", view: "medidas", focus: null }],
    // Un alias con vista fija gana sobre ?vista=.
    ["diario", "turnos", { tab: "historial", view: "diario", focus: null }],
  ] as const)("tab=%s vista=%s", (tab, vista, expected) => {
    expect(resolvePatientTab(tab, vista)).toEqual(expected);
  });
});

describe("patientTabQuery", () => {
  it("resumen va sin tab", () => {
    expect(patientTabQuery("resumen", "medidas").toString()).toBe("");
    expect(patientTabQuery("resumen", "turnos").toString()).toBe("");
  });
  it("historial con vista solo si no es medidas", () => {
    expect(patientTabQuery("historial", "turnos").toString()).toBe("tab=historial&vista=turnos");
    expect(patientTabQuery("historial", "diario").toString()).toBe("tab=historial&vista=diario");
    expect(patientTabQuery("historial", "medidas").toString()).toBe("tab=historial");
  });
  it("consultas y planes sin vista", () => {
    expect(patientTabQuery("consultas", "turnos").toString()).toBe("tab=consultas");
    expect(patientTabQuery("planes", "medidas").toString()).toBe("tab=planes");
  });
  it("lo que escribe se resuelve igual (ida y vuelta)", () => {
    for (const [tab, view] of [
      ["resumen", "medidas"],
      ["consultas", "medidas"],
      ["planes", "medidas"],
      ["historial", "medidas"],
      ["historial", "turnos"],
      ["historial", "diario"],
    ] as const) {
      const q = patientTabQuery(tab, view);
      expect(resolvePatientTab(q.get("tab"), q.get("vista"))).toMatchObject({ tab, view });
    }
  });
});

describe("patientTabHref y withoutSearchParam", () => {
  const base = "http://localhost:3000/pacientes/p1";
  it("escribe la query canónica y conserva otros parámetros", () => {
    expect(patientTabHref(`${base}?editar=datos`, "historial", "turnos")).toBe(
      `${base}?editar=datos&tab=historial&vista=turnos`,
    );
    expect(patientTabHref(`${base}?tab=historial&vista=diario`, "resumen", "diario")).toBe(base);
    expect(patientTabHref(`${base}?tab=datos`, "consultas", "medidas")).toBe(`${base}?tab=consultas`);
  });
  it("saca un parámetro", () => {
    expect(withoutSearchParam(`${base}?tab=historial&editar=datos`, "editar")).toBe(`${base}?tab=historial`);
    expect(withoutSearchParam(base, "editar")).toBe(base);
  });
});

describe("replaceUrlInRouter", () => {
  const original = globalThis.window;
  afterEach(() => {
    globalThis.window = original;
  });

  it("llama a replaceState con estado null (así Next sincroniza su router y una server action no la pisa)", () => {
    globalThis.window = { location: { href: "http://localhost/pacientes/p1" } } as unknown as Window & typeof globalThis;
    const history = { replaceState: vi.fn() };
    replaceUrlInRouter("http://localhost/pacientes/p1?tab=historial", history);
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "http://localhost/pacientes/p1?tab=historial");
  });

  it("no hace nada si la URL no cambia", () => {
    globalThis.window = { location: { href: "http://localhost/pacientes/p1" } } as unknown as Window & typeof globalThis;
    const history = { replaceState: vi.fn() };
    replaceUrlInRouter("http://localhost/pacientes/p1", history);
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});

describe("la ficha escribe la URL solo con replaceUrlInRouter", () => {
  // Guarda de la ronda 2: `replaceState(window.history.state, …)` deja a Next sin sincronizar y una
  // server action posterior vuelve a escribir la URL vieja. Los dos archivos pasan por el helper.
  it.each(["patient-tabs.tsx", "edit-patient-sheet.tsx"])("%s no llama a history.replaceState directo", (file) => {
    const source = readFileSync(join(__dirname, "../app/(panel)/pacientes/[id]", file), "utf8");
    expect(source).not.toMatch(/history\.replaceState\s*\(/);
    expect(source).toContain("replaceUrlInRouter(");
  });
});
