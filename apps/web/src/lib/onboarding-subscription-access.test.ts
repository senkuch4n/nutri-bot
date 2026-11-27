import { describe, expect, it, vi } from "vitest";
import { resolveOnboardingSubscriptionAccess } from "./onboarding-subscription-access";

const tenantId = "onboarded-clinic";

describe("resolveOnboardingSubscriptionAccess", () => {
  it.each([
    { status: "not_required", canOperate: true },
    { status: "verified", canOperate: true },
    { status: "pending", canOperate: false },
  ] as const)("returns the access decision for $status", async (decision) => {
    const getGate = vi.fn().mockResolvedValue(decision.status);

    await expect(resolveOnboardingSubscriptionAccess(tenantId, getGate)).resolves.toEqual(decision);
    expect(getGate).toHaveBeenCalledTimes(1);
    expect(getGate).toHaveBeenCalledWith(tenantId);
  });

  it("keeps the clinic in onboarding when the lookup throws", async () => {
    const getGate = vi.fn().mockRejectedValue(new Error("Subscription lookup failed"));

    await expect(resolveOnboardingSubscriptionAccess(tenantId, getGate)).resolves.toEqual({
      status: "pending",
      canOperate: false,
    });
    expect(getGate).toHaveBeenCalledTimes(1);
    expect(getGate).toHaveBeenCalledWith(tenantId);
  });
});
