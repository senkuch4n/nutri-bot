import { describe, expect, it, vi } from "vitest";

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../index", () => ({
  Prisma: { TransactionIsolationLevel: { ReadCommitted: "ReadCommitted" } },
  prisma: { $transaction: transaction },
}));

import { createOrResumeTenantOnboarding } from "./tenantOnboarding";
import { provisionOnboardedClinic } from "./tenantOnboardingProvisioning";

describe("createOrResumeTenantOnboarding", () => {
  it.each([
    { name: "  ", timeZone: "America/Montevideo", error: "Clinic name is required" },
    { name: "Consultorio", timeZone: "", error: "Clinic time zone must be valid" },
    { name: "Consultorio", timeZone: "Not/A_Time_Zone", error: "Clinic time zone must be valid" },
  ])("rejects invalid clinic setup without opening a transaction ($error)", async ({ name, timeZone, error }) => {
    await expect(createOrResumeTenantOnboarding({ userId: "verified-user", name, timeZone }))
      .rejects.toThrow(error);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("provisionOnboardedClinic", () => {
  it("rejects a blank professional name without opening a transaction", async () => {
    await expect(
      provisionOnboardedClinic({ userId: "verified-user", professionalName: "   ", expectedTenantId: "clinic-1" }),
    ).rejects.toThrow("Professional name is required");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("uses pg_advisory_xact_lock instead of LOCK TABLE when allocating professional IDs", async () => {
    const executedSql: string[] = [];
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ email: "owner@example.test" }])
        .mockResolvedValueOnce([{ tenantId: "clinic-1", role: "OWNER", name: "Consultorio Sur", timeZone: "America/Montevideo" }])
        .mockResolvedValueOnce([{ id: 2 }]),
      $executeRaw: vi.fn((strings: TemplateStringsArray) => {
        executedSql.push(strings.join("?"));
        return Promise.resolve(1);
      }),
      agenda: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "agenda-1" }),
      },
      professional: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 2 }),
      },
    };
    transaction.mockImplementationOnce(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));

    const result = await provisionOnboardedClinic({
      userId: "verified-user",
      professionalName: "Dra. Ana",
      expectedTenantId: "clinic-1",
    });

    expect(result).toEqual({ tenantId: "clinic-1", professionalId: 2, agendaId: "agenda-1" });
    expect(executedSql.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(executedSql.some((sql) => sql.includes("LOCK TABLE"))).toBe(false);
  });
});
