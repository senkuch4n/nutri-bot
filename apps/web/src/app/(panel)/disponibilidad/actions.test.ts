// HU-017b-2 (SDD 4.3, 9-2): horarios editables, sin superposición entre las reglas activas, borrados con
// resultado para el commit diferido y excepciones en palabras. Todo con mocks (sin base).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AVAILABILITY_TEXT } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  ruleFindMany: vi.fn(),
  ruleFindFirst: vi.fn(),
  ruleCreate: vi.fn(),
  ruleUpdate: vi.fn(),
  ruleDeleteMany: vi.fn(),
  excCreate: vi.fn(),
  excDeleteMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@nutri-bot/db", () => ({
  prisma: {
    availabilityRule: {
      findMany: mocks.ruleFindMany,
      findFirst: mocks.ruleFindFirst,
      create: mocks.ruleCreate,
      update: mocks.ruleUpdate,
      deleteMany: mocks.ruleDeleteMany,
    },
    availabilityException: { create: mocks.excCreate, deleteMany: mocks.excDeleteMany },
  },
}));

import {
  addExceptionAction,
  addRuleAction,
  deleteExceptionAction,
  deleteRuleAction,
  updateRuleAction,
} from "./actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const prev = { ok: false };
const MONDAY = [
  { id: "am", startTime: "09:00", endTime: "13:00" },
  { id: "pm", startTime: "15:00", endTime: "19:00" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ruleFindMany.mockResolvedValue(MONDAY);
  mocks.ruleFindFirst.mockResolvedValue({ id: "pm" });
});

describe("addRuleAction", () => {
  it("guarda si no choca con nada", async () => {
    const r = await addRuleAction(prev, form({ weekday: "1", startTime: "13:00", endTime: "15:00" }));
    expect(r).toEqual({ ok: true });
    expect(mocks.ruleCreate).toHaveBeenCalledWith({ data: { weekday: 1, startTime: "13:00", endTime: "15:00" } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/disponibilidad");
  });

  it("valida solo contra las reglas activas del mismo día", async () => {
    await addRuleAction(prev, form({ weekday: "1", startTime: "13:00", endTime: "15:00" }));
    expect(mocks.ruleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { weekday: 1, active: true } }),
    );
  });

  it("12–16 choca con 9–13: mensaje junto a Desde y no guarda nada", async () => {
    const r = await addRuleAction(prev, form({ weekday: "1", startTime: "12:00", endTime: "16:00" }));
    expect(r).toEqual({
      ok: false,
      error: "Se superpone con el horario de 9:00 a 13:00. Cambiá las horas o editá ese horario.",
      field: "startTime",
    });
    expect(mocks.ruleCreate).not.toHaveBeenCalled();
  });

  it("inicio después del fin → error en Hasta", async () => {
    const r = await addRuleAction(prev, form({ weekday: "2", startTime: "13:00", endTime: "09:00" }));
    expect(r).toEqual({ ok: false, error: AVAILABILITY_TEXT.startBeforeEnd, field: "endTime" });
    expect(mocks.ruleFindMany).not.toHaveBeenCalled();
    expect(mocks.ruleCreate).not.toHaveBeenCalled();
  });

  it("hora mal escrita → error en ese campo", async () => {
    const r = await addRuleAction(prev, form({ weekday: "2", startTime: "9", endTime: "13:00" }));
    expect(r.ok).toBe(false);
    expect(r.field).toBe("startTime");
    expect(mocks.ruleCreate).not.toHaveBeenCalled();
  });
});

describe("updateRuleAction", () => {
  it("cambia Hasta a 20:00 sin chocar consigo mismo y toca solo día, desde y hasta", async () => {
    const r = await updateRuleAction(prev, form({ id: "pm", weekday: "1", startTime: "15:00", endTime: "20:00", active: "1" }));
    expect(r).toEqual({ ok: true });
    expect(mocks.ruleUpdate).toHaveBeenCalledWith({
      where: { id: "pm" },
      data: { weekday: 1, startTime: "15:00", endTime: "20:00" },
    });
  });

  it("solo edita reglas activas", async () => {
    await updateRuleAction(prev, form({ id: "pm", weekday: "1", startTime: "15:00", endTime: "20:00" }));
    expect(mocks.ruleFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pm", active: true } }));
  });

  it("superposición con otro horario del día → no guarda", async () => {
    const r = await updateRuleAction(prev, form({ id: "pm", weekday: "1", startTime: "12:00", endTime: "19:00" }));
    expect(r).toEqual({ ok: false, error: AVAILABILITY_TEXT.overlap(MONDAY[0]!), field: "startTime" });
    expect(mocks.ruleUpdate).not.toHaveBeenCalled();
  });

  it("inexistente (o inactiva) → pide recargar", async () => {
    mocks.ruleFindFirst.mockResolvedValue(null);
    const r = await updateRuleAction(prev, form({ id: "x", weekday: "1", startTime: "15:00", endTime: "20:00" }));
    expect(r).toEqual({ ok: false, error: "Ese horario ya no está. Recargá la página." });
    expect(mocks.ruleUpdate).not.toHaveBeenCalled();
  });

  it("borrada entre la lectura y el update (P2025) → pide recargar", async () => {
    mocks.ruleUpdate.mockRejectedValue(Object.assign(new Error("Record not found"), { code: "P2025" }));
    const r = await updateRuleAction(prev, form({ id: "pm", weekday: "1", startTime: "15:00", endTime: "20:00" }));
    expect(r).toEqual({ ok: false, error: "Ese horario ya no está. Recargá la página." });
  });
});

describe("deleteRuleAction", () => {
  it("devuelve ok y borra por id solo si está activa", async () => {
    mocks.ruleDeleteMany.mockResolvedValue({ count: 1 });
    await expect(deleteRuleAction("pm")).resolves.toEqual({ ok: true });
    expect(mocks.ruleDeleteMany).toHaveBeenCalledWith({ where: { id: "pm", active: true } });
  });

  it("ya borrada → ok (commit diferido tardío inofensivo)", async () => {
    mocks.ruleDeleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteRuleAction("pm")).resolves.toEqual({ ok: true });
  });

  it("si la base falla devuelve el error (el horario vuelve a verse)", async () => {
    mocks.ruleDeleteMany.mockRejectedValue(new Error("db down"));
    const r = await deleteRuleAction("pm");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe("addExceptionAction", () => {
  it("No atiendo todo el día → BLOCKED sin horas aunque lleguen horas", async () => {
    const r = await addExceptionAction(
      prev,
      form({ date: "2026-10-12", kind: "closed_day", startTime: "10:00", endTime: "12:00", reason: " Feriado " }),
    );
    expect(r).toEqual({ ok: true });
    expect(mocks.excCreate).toHaveBeenCalledWith({
      data: { date: new Date("2026-10-12T00:00:00Z"), type: "BLOCKED", startTime: null, endTime: null, reason: "Feriado" },
    });
  });

  it("No atiendo un rato → BLOCKED con horas", async () => {
    await addExceptionAction(prev, form({ date: "2026-10-12", kind: "closed_range", startTime: "14:00", endTime: "16:00" }));
    expect(mocks.excCreate).toHaveBeenCalledWith({
      data: { date: new Date("2026-10-12T00:00:00Z"), type: "BLOCKED", startTime: "14:00", endTime: "16:00", reason: null },
    });
  });

  it("Atiendo en otro horario → CUSTOM_HOURS con horas", async () => {
    await addExceptionAction(prev, form({ date: "2026-10-16", kind: "custom_hours", startTime: "14:00", endTime: "18:00", reason: "" }));
    expect(mocks.excCreate).toHaveBeenCalledWith({
      data: { date: new Date("2026-10-16T00:00:00Z"), type: "CUSTOM_HOURS", startTime: "14:00", endTime: "18:00", reason: null },
    });
  });

  it("un rato sin horas → error y no guarda", async () => {
    const r = await addExceptionAction(prev, form({ date: "2026-10-12", kind: "closed_range", startTime: "", endTime: "" }));
    expect(r).toMatchObject({ ok: false, field: "startTime" });
    expect(mocks.excCreate).not.toHaveBeenCalled();
  });

  it("horas al revés → error en Hasta", async () => {
    const r = await addExceptionAction(prev, form({ date: "2026-10-12", kind: "custom_hours", startTime: "18:00", endTime: "14:00" }));
    expect(r).toEqual({ ok: false, error: AVAILABILITY_TEXT.startBeforeEnd, field: "endTime" });
  });

  it("sin fecha → error", async () => {
    const r = await addExceptionAction(prev, form({ date: "", kind: "closed_day" }));
    expect(r.ok).toBe(false);
    expect(mocks.excCreate).not.toHaveBeenCalled();
  });
});

describe("deleteExceptionAction", () => {
  it("devuelve ok y borra por id", async () => {
    mocks.excDeleteMany.mockResolvedValue({ count: 1 });
    await expect(deleteExceptionAction("e1")).resolves.toEqual({ ok: true });
    expect(mocks.excDeleteMany).toHaveBeenCalledWith({ where: { id: "e1" } });
  });

  it("si la base falla devuelve el error", async () => {
    mocks.excDeleteMany.mockRejectedValue(new Error("db down"));
    await expect(deleteExceptionAction("e1")).resolves.toMatchObject({ ok: false });
  });
});
