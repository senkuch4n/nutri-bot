import "server-only";
import { decideTenantAccess, type AccessDenial, type AccessFacts, type AccessGrant } from "@nutri-bot/core";
import { resolveOnboardingSubscriptionAccess, type GetTenantSubscriptionGate } from "./onboarding-subscription-access";

type OnboardingAccessDependencies = {
  readSession: () => Promise<{ userId?: string | null } | null>;
  loadAccessFacts: (userId: string) => Promise<AccessFacts | null>;
  existingEnabledTenantIds: readonly string[];
  loadOnboardedClinic: (tenantId: string) => Promise<{ name: string; timeZone: string; setupComplete: boolean } | null>;
  getTenantSubscriptionGate: GetTenantSubscriptionGate;
};

export type OnboardingAccess =
  | { kind: "operational"; grant: AccessGrant }
  | { kind: "setup"; tenantId: string; clinicName: string; timeZone: string }
  | { kind: "onboarding"; clinicName: string }
  | { kind: "denied"; reason: AccessDenial | "unauthenticated" | "subscription_pending" };

// The caller supplies trusted server dependencies; callers cannot select a tenant.
// An operational grant still needs the panel's regular context and scope checks.
export function createOnboardingAccessAdapter(deps: OnboardingAccessDependencies) {
  async function resolve(): Promise<OnboardingAccess> {
    const session = await deps.readSession();
    if (!session) return { kind: "denied", reason: "unauthenticated" };
    if (!session.userId) return { kind: "denied", reason: "unlinked" };

    const decision = decideTenantAccess(await deps.loadAccessFacts(session.userId));
    if (!decision.ok) return { kind: "denied", reason: decision.reason };

    const { grant } = decision;
    if (deps.existingEnabledTenantIds.includes(grant.tenantId)) {
      return { kind: "operational", grant };
    }
    if (grant.kind !== "member") return { kind: "denied", reason: "tenant_not_enabled" };

    const clinic = await deps.loadOnboardedClinic(grant.tenantId);
    if (!clinic) return { kind: "denied", reason: "tenant_not_enabled" };
    if (!clinic.setupComplete) {
      return grant.role === "OWNER"
        ? { kind: "setup", tenantId: grant.tenantId, clinicName: clinic.name, timeZone: clinic.timeZone }
        : { kind: "denied", reason: "tenant_not_enabled" };
    }

    const subscription = await resolveOnboardingSubscriptionAccess(grant.tenantId, deps.getTenantSubscriptionGate);
    if (subscription.canOperate) return { kind: "operational", grant };
    if (grant.role === "OWNER") return { kind: "onboarding", clinicName: clinic.name };
    return { kind: "denied", reason: "subscription_pending" };
  }

  async function getOperationalGrant(): Promise<AccessGrant | null> {
    const access = await resolve();
    return access.kind === "operational" ? access.grant : null;
  }

  return { resolve, getOperationalGrant };
}
