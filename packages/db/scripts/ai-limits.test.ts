import { describe, expect, it, vi } from "vitest";
import { parseArgs, run, USAGE } from "./ai-limits";

const fails = (argv: string[], message: string) => expect(() => parseArgs(argv)).toThrow(message);

describe("ai-limits parseArgs (HU-028c)", () => {
  it("help", () => expect(parseArgs(["--help"])).toEqual({ name: "help" }));

  it("show --tenant legacy-tenant", () =>
    expect(parseArgs(["show", "--tenant", "legacy-tenant"])).toEqual({ name: "show", tenantId: "legacy-tenant" }));

  it("set con un solo valor es dry-run por defecto; el otro no cambia", () =>
    expect(parseArgs(["set", "--tenant", "t1", "--per-tenant", "5"])).toEqual({
      name: "set",
      tenantId: "t1",
      values: { botDailyPerTenant: 5 },
      apply: false,
    }));

  it("set con los dos valores, default y --apply en cualquier posición", () =>
    expect(parseArgs(["set", "--apply", "--per-patient", "default", "--tenant", "t1", "--per-tenant", "0"])).toEqual({
      name: "set",
      tenantId: "t1",
      values: { botDailyPerPatient: null, botDailyPerTenant: 0 },
      apply: true,
    }));

  it("set sin ningún valor → error", () => fails(["set", "--tenant", "t1"], "Set at least one of --per-patient or --per-tenant."));

  it("valores inválidos → error", () => {
    fails(["set", "--tenant", "t1", "--per-patient", "abc"], "Invalid value");
    fails(["set", "--tenant", "t1", "--per-tenant", "100001"], "Invalid value");
    fails(["set", "--tenant", "t1", "--per-tenant", "-1"], "Invalid value");
  });

  it("tenant con caracteres inválidos → error", () => {
    fails(["show", "--tenant", "a b"], "Invalid tenant id.");
    fails(["set", "--tenant", "x;drop", "--per-tenant", "1"], "Invalid tenant id.");
  });

  it.each([
    [[]],
    [["desconocido"]],
    [["show"]],
    [["show", "--tenant", "t1", "--apply"]],
    [["show", "--tenant", "t1", "--per-tenant", "3"]],
    [["set", "--per-tenant", "3"]],
    [["set", "--tenant", "t1", "--per-tenant", "3", "--apply", "--apply"]],
    [["set", "--tenant", "t1", "--per-tenant", "3", "--per-tenant", "4"]],
  ])("uso inválido %j", (argv) => fails(argv, USAGE));
});

describe("ai-limits run (HU-028c)", () => {
  function fakeDb(row: { botDailyPerPatient: number | null; botDailyPerTenant: number | null } | null, tenantExists = true) {
    const tx = {
      tenant: { findUnique: vi.fn().mockResolvedValue(tenantExists ? { id: "t1" } : null) },
      tenantAiSettings: {
        findUnique: vi.fn().mockResolvedValue(row),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const db = { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
    return { db, tx };
  }

  it("show sin fila → nulls", async () => {
    const { db } = fakeDb(null);
    expect(await run({ name: "show", tenantId: "t1" }, db as never)).toEqual([
      JSON.stringify({ tenantId: "t1", botDailyPerPatient: null, botDailyPerTenant: null }),
    ]);
  });

  it("tenant inexistente → tenant_not_found", async () => {
    const { db } = fakeDb(null, false);
    await expect(run({ name: "show", tenantId: "t1" }, db as never)).rejects.toThrow("tenant_not_found");
  });

  it("set dry-run no escribe e imprime before/after", async () => {
    const { db, tx } = fakeDb({ botDailyPerPatient: 7, botDailyPerTenant: null });
    const out = await run({ name: "set", tenantId: "t1", values: { botDailyPerTenant: 5 }, apply: false }, db as never);
    expect(JSON.parse(out[0]!)).toEqual({
      mode: "dry-run",
      tenantId: "t1",
      before: { botDailyPerPatient: 7, botDailyPerTenant: null },
      after: { botDailyPerPatient: 7, botDailyPerTenant: 5 },
    });
    expect(tx.tenantAiSettings.upsert).not.toHaveBeenCalled();
  });

  it("set --apply hace upsert solo con el valor indicado", async () => {
    const { db, tx } = fakeDb(null);
    const out = await run({ name: "set", tenantId: "t1", values: { botDailyPerTenant: 5 }, apply: true }, db as never);
    expect(JSON.parse(out[0]!).mode).toBe("apply");
    expect(tx.tenantAiSettings.upsert).toHaveBeenCalledWith({
      where: { tenantId: "t1" },
      create: { tenantId: "t1", botDailyPerPatient: null, botDailyPerTenant: 5 },
      update: { botDailyPerTenant: 5 },
    });
  });
});
