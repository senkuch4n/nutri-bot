import { describe, expect, it, vi } from "vitest";
import type { AccessFacts } from "@nutri-bot/core";
import type { TenantSubscriptionGate } from "./onboarding-subscription-access";

vi.mock("server-only", () => ({}));

import { createOnboardingAccessAdapter } from "./onboarding-access-adapter";

const clinicId = "clinic-from-membership";
const legacyId = "legacy-tenant";
const userId = "owner-from-session";
const foreignId = "clinic-from-browser";
const clinic = { name: "Consultorio del Sur", setupComplete: true };
const facts = (memberships: AccessFacts["memberships"]): AccessFacts => ({
  linked: true, memberships, platformOperator: false, activeSupportGrants: [],
});

function setup() {
  const readSession = vi.fn().mockResolvedValue({ userId, tenantId: foreignId });
  const loadAccessFacts = vi.fn().mockResolvedValue(facts([{ tenantId: clinicId, role: "OWNER" }]));
  const loadOnboardedClinic = vi.fn().mockResolvedValue(clinic);
  const getTenantSubscriptionGate = vi.fn<(_tenantId: string) => Promise<TenantSubscriptionGate>>()
    .mockResolvedValue("verified");
  const adapter = createOnboardingAccessAdapter({
    readSession, loadAccessFacts, loadOnboardedClinic, getTenantSubscriptionGate,
    existingEnabledTenantIds: [legacyId],
  });
  return { adapter, readSession, loadAccessFacts, loadOnboardedClinic, getTenantSubscriptionGate };
}

const grant = { kind: "member", tenantId: clinicId, role: "OWNER" };

describe("createOnboardingAccessAdapter", () => {
  it.each(["verified", "not_required"] as const)("grants operation for a member at %s using the membership's tenant", async (status) => {
    const { adapter, loadAccessFacts, loadOnboardedClinic, getTenantSubscriptionGate } = setup();
    getTenantSubscriptionGate.mockResolvedValue(status);

    expect(await adapter.getOperationalGrant()).toEqual(grant);
    expect(loadAccessFacts).toHaveBeenCalledWith(userId);
    expect(loadOnboardedClinic.mock.calls).toEqual([[clinicId]]);
    expect(getTenantSubscriptionGate.mock.calls).toEqual([[clinicId]]);
  });

  it.each(["pending", "lookup error"] as const)("allows resuming but withholds operational grants on %s", async (state) => {
    const { adapter, getTenantSubscriptionGate } = setup();
    if (state === "pending") getTenantSubscriptionGate.mockResolvedValue("pending");
    else getTenantSubscriptionGate.mockRejectedValue(new Error("Unavailable"));

    // Test consumers stand in for the action and the API; no production route calls this adapter yet.
    const write = vi.fn();
    const action = async () => {
      const access = await adapter.getOperationalGrant();
      if (!access) throw new Error("tenant_access:no_context");
      write(access);
    };
    const api = async () => {
      const access = await adapter.getOperationalGrant();
      if (!access) return new Response(null, { status: 401 });
      write(access);
      return new Response(null, { status: 204 });
    };

    expect(await adapter.resolve()).toEqual({ kind: "onboarding", clinicName: clinic.name });
    await expect(action()).rejects.toThrow("tenant_access:no_context");
    expect((await api()).status).toBe(401);
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps existing clinics operational without querying the subscription provider", async () => {
    const { adapter, loadAccessFacts, loadOnboardedClinic, getTenantSubscriptionGate } = setup();
    loadAccessFacts.mockResolvedValue(facts([{ tenantId: legacyId, role: "STAFF" }]));
    getTenantSubscriptionGate.mockRejectedValue(new Error("Unavailable"));

    expect(await adapter.getOperationalGrant()).toEqual({ kind: "member", tenantId: legacyId, role: "STAFF" });
    expect(loadOnboardedClinic).not.toHaveBeenCalled();
    expect(getTenantSubscriptionGate).not.toHaveBeenCalled();
  });

  it("does not look up subscription when no trusted membership or onboarding profile exists", async () => {
    const { adapter, loadAccessFacts, loadOnboardedClinic, getTenantSubscriptionGate } = setup();
    loadAccessFacts.mockResolvedValueOnce(facts([]));
    loadOnboardedClinic.mockResolvedValueOnce(null);

    expect(await adapter.resolve()).toEqual({ kind: "denied", reason: "no_membership" });
    expect(loadOnboardedClinic).not.toHaveBeenCalled();
    expect(await adapter.resolve()).toEqual({ kind: "denied", reason: "tenant_not_enabled" });
    expect(getTenantSubscriptionGate).not.toHaveBeenCalled();
  });
});
