import { describe, expect, it } from "vitest";
import {
  decideOnboardedClinicSetupAccess,
  decideOnboardingAccess,
  decideOnboardingSubscriptionAccess,
  decidePostSetupOnboardingAccess,
  decidePreClinicOnboardingAccess,
} from "./onboarding-access";
import type { AccessFacts, AccessGrant } from "./tenant-access";

const legacyId = "legacy-tenant";
const clinicId = "clinic-new";
const ownerGrant: AccessGrant = { kind: "member", tenantId: clinicId, role: "OWNER" };
const staffGrant: AccessGrant = { kind: "member", tenantId: clinicId, role: "STAFF" };
const supportGrant: AccessGrant = {
  kind: "support",
  tenantId: clinicId,
  grantId: "grant-1",
  mode: "READ_ONLY",
  expiresAt: new Date("2030-01-01T00:00:00Z"),
};
const completeClinic = { name: "Consultorio del Sur", timeZone: "America/Montevideo", setupComplete: true };
const incompleteClinic = { name: "Consultorio del Sur", timeZone: "America/Montevideo", setupComplete: false };

const facts = (memberships: AccessFacts["memberships"], linked = true): AccessFacts => ({
  linked,
  memberships,
  platformOperator: false,
  activeSupportGrants: [],
});

describe("decideOnboardingSubscriptionAccess", () => {
  it.each([
    { input: "not_required", expected: { status: "not_required", canOperate: true } },
    { input: "verified", expected: { status: "verified", canOperate: true } },
    { input: "pending", expected: { status: "pending", canOperate: false } },
    { input: null, expected: { status: "pending", canOperate: false } },
    { input: undefined, expected: { status: "pending", canOperate: false } },
  ] as const)("returns $expected.status (canOperate=$expected.canOperate) for $input", ({ input, expected }) => {
    expect(decideOnboardingSubscriptionAccess(input)).toEqual(expected);
  });
});

describe("decidePreClinicOnboardingAccess", () => {
  it("grants operational access immediately for existing enabled tenants", () => {
    const legacyGrant: AccessGrant = { kind: "member", tenantId: legacyId, role: "STAFF" };
    expect(decidePreClinicOnboardingAccess(legacyGrant, [legacyId])).toEqual({
      kind: "operational",
      grant: legacyGrant,
    });
  });

  it("denies non-member grants outside existing enabled tenants", () => {
    expect(decidePreClinicOnboardingAccess(supportGrant, [legacyId])).toEqual({
      kind: "denied",
      reason: "tenant_not_enabled",
    });
  });

  it("returns null when clinic lookup is needed for a new tenant member", () => {
    expect(decidePreClinicOnboardingAccess(ownerGrant, [legacyId])).toBeNull();
  });
});

describe("decideOnboardedClinicSetupAccess", () => {
  it("denies when clinic profile is missing", () => {
    expect(decideOnboardedClinicSetupAccess(ownerGrant, null)).toEqual({
      kind: "denied",
      reason: "tenant_not_enabled",
    });
  });

  it("returns setup for OWNER when setup is incomplete", () => {
    expect(decideOnboardedClinicSetupAccess(ownerGrant, incompleteClinic)).toEqual({
      kind: "setup",
      tenantId: clinicId,
      clinicName: incompleteClinic.name,
      timeZone: incompleteClinic.timeZone,
    });
  });

  it("denies STAFF when setup is incomplete", () => {
    expect(decideOnboardedClinicSetupAccess(staffGrant, incompleteClinic)).toEqual({
      kind: "denied",
      reason: "tenant_not_enabled",
    });
  });

  it("returns null when setup is complete so subscription gate can be checked", () => {
    expect(decideOnboardedClinicSetupAccess(ownerGrant, completeClinic)).toBeNull();
  });
});

describe("decidePostSetupOnboardingAccess", () => {
  it.each(["verified", "not_required"] as const)("grants operational access when subscription is %s", (gate) => {
    expect(decidePostSetupOnboardingAccess(ownerGrant, completeClinic, gate)).toEqual({
      kind: "operational",
      grant: ownerGrant,
    });
    expect(decidePostSetupOnboardingAccess(staffGrant, completeClinic, gate)).toEqual({
      kind: "operational",
      grant: staffGrant,
    });
  });

  it("returns onboarding for OWNER and subscription_pending for STAFF when pending or missing", () => {
    expect(decidePostSetupOnboardingAccess(ownerGrant, completeClinic, "pending")).toEqual({
      kind: "onboarding",
      clinicName: completeClinic.name,
    });
    expect(decidePostSetupOnboardingAccess(staffGrant, completeClinic, "pending")).toEqual({
      kind: "denied",
      reason: "subscription_pending",
    });
    expect(decidePostSetupOnboardingAccess(ownerGrant, completeClinic, null)).toEqual({
      kind: "onboarding",
      clinicName: completeClinic.name,
    });
  });
});

describe("decideOnboardingAccess", () => {
  it("handles unauthenticated and unlinked sessions", () => {
    expect(decideOnboardingAccess({ session: null, facts: null, existingEnabledTenantIds: [legacyId] })).toEqual({
      kind: "denied",
      reason: "unauthenticated",
    });
    expect(decideOnboardingAccess({ session: { userId: null }, facts: null, existingEnabledTenantIds: [legacyId] })).toEqual({
      kind: "denied",
      reason: "unlinked",
    });
  });

  it("propagates tenant access denials when membership is missing or ambiguous", () => {
    expect(
      decideOnboardingAccess({
        session: { userId: "u1" },
        facts: facts([]),
        existingEnabledTenantIds: [legacyId],
      }),
    ).toEqual({ kind: "denied", reason: "no_membership" });
  });

  it("resolves setup, onboarding, and operational states end-to-end", () => {
    expect(
      decideOnboardingAccess({
        session: { userId: "u1" },
        facts: facts([{ tenantId: clinicId, role: "OWNER" }]),
        existingEnabledTenantIds: [legacyId],
        clinic: incompleteClinic,
        subscriptionGate: "verified",
      }),
    ).toEqual({
      kind: "setup",
      tenantId: clinicId,
      clinicName: incompleteClinic.name,
      timeZone: incompleteClinic.timeZone,
    });

    expect(
      decideOnboardingAccess({
        session: { userId: "u1" },
        facts: facts([{ tenantId: clinicId, role: "OWNER" }]),
        existingEnabledTenantIds: [legacyId],
        clinic: completeClinic,
        subscriptionGate: "pending",
      }),
    ).toEqual({ kind: "onboarding", clinicName: completeClinic.name });

    expect(
      decideOnboardingAccess({
        session: { userId: "u1" },
        facts: facts([{ tenantId: clinicId, role: "OWNER" }]),
        existingEnabledTenantIds: [legacyId],
        clinic: completeClinic,
        subscriptionGate: "verified",
      }),
    ).toEqual({ kind: "operational", grant: ownerGrant });
  });
});
