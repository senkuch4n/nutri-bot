import { describe, expect, it, vi } from "vitest";

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../index", () => ({ prisma: { $transaction: transaction } }));

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
});
