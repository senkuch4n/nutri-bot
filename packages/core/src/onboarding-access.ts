import { decideTenantAccess, type AccessDenial, type AccessFacts, type AccessGrant } from "./tenant-access";

export type TenantSubscriptionGate = "not_required" | "verified" | "pending";

export type OnboardingSubscriptionAccess =
  | { status: "not_required" | "verified"; canOperate: true }
  | { status: "pending"; canOperate: false };

export type OnboardedClinicProfile = {
  name: string;
  timeZone: string;
  setupComplete: boolean;
};

export type OnboardingAccess =
  | { kind: "operational"; grant: AccessGrant }
  | { kind: "setup"; tenantId: string; clinicName: string; timeZone: string }
  | { kind: "onboarding"; clinicName: string }
  | { kind: "denied"; reason: AccessDenial | "unauthenticated" | "subscription_pending" };

/**
 * Pure subscription gate decision for newly onboarded clinics.
 * Fails closed to pending when the gate is missing or unrecognized.
 */
export function decideOnboardingSubscriptionAccess(
  status: TenantSubscriptionGate | null | undefined,
): OnboardingSubscriptionAccess {
  if (status === "not_required" || status === "verified") {
    return { status, canOperate: true };
  }
  return { status: "pending", canOperate: false };
}

/**
 * Decides whether a verified access grant can bypass onboarding lookup or must be denied
 * before loading clinic/subscription state. Returns null when clinic lookup is required.
 */
export function decidePreClinicOnboardingAccess(
  grant: AccessGrant,
  existingEnabledTenantIds: readonly string[],
): OnboardingAccess | null {
  if (existingEnabledTenantIds.includes(grant.tenantId)) {
    return { kind: "operational", grant };
  }
  if (grant.kind !== "member") {
    return { kind: "denied", reason: "tenant_not_enabled" };
  }
  return null;
}

/**
 * Decides whether an onboarded clinic still needs initial setup before checking subscription.
 * Returns null when setup is complete and subscription status must be evaluated.
 */
export function decideOnboardedClinicSetupAccess(
  grant: AccessGrant,
  clinic: OnboardedClinicProfile | null,
): OnboardingAccess | null {
  if (grant.kind !== "member" || !clinic) {
    return { kind: "denied", reason: "tenant_not_enabled" };
  }
  if (!clinic.setupComplete) {
    return grant.role === "OWNER"
      ? { kind: "setup", tenantId: grant.tenantId, clinicName: clinic.name, timeZone: clinic.timeZone }
      : { kind: "denied", reason: "tenant_not_enabled" };
  }
  return null;
}

/**
 * Final access decision for a clinic with completed setup, given its subscription gate.
 */
export function decidePostSetupOnboardingAccess(
  grant: AccessGrant,
  clinic: OnboardedClinicProfile,
  subscriptionGate: TenantSubscriptionGate | null | undefined,
): OnboardingAccess {
  const subscription = decideOnboardingSubscriptionAccess(subscriptionGate);
  if (subscription.canOperate) {
    return { kind: "operational", grant };
  }
  if (grant.kind === "member" && grant.role === "OWNER") {
    return { kind: "onboarding", clinicName: clinic.name };
  }
  return { kind: "denied", reason: "subscription_pending" };
}

/**
 * End-to-end pure onboarding access decision when all facts are already loaded.
 */
export function decideOnboardingAccess(input: {
  session: { userId?: string | null } | null;
  facts: AccessFacts | null;
  existingEnabledTenantIds: readonly string[];
  clinic?: OnboardedClinicProfile | null;
  subscriptionGate?: TenantSubscriptionGate | null;
}): OnboardingAccess {
  if (!input.session) return { kind: "denied", reason: "unauthenticated" };
  if (!input.session.userId) return { kind: "denied", reason: "unlinked" };

  const decision = decideTenantAccess(input.facts);
  if (!decision.ok) return { kind: "denied", reason: decision.reason };

  const preClinic = decidePreClinicOnboardingAccess(decision.grant, input.existingEnabledTenantIds);
  if (preClinic) return preClinic;

  const clinic = input.clinic ?? null;
  const setupDecision = decideOnboardedClinicSetupAccess(decision.grant, clinic);
  if (setupDecision) return setupDecision;

  return decidePostSetupOnboardingAccess(decision.grant, clinic!, input.subscriptionGate);
}
