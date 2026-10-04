import { describe, expect, it } from "vitest";
import { patientTabQuery, resolvePatientTab } from "./patient-tab-route";

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
