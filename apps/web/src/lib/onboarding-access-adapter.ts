import "server-only";
import {
  decideOnboardedClinicSetupAccess,
  decidePostSetupOnboardingAccess,
  decidePreClinicOnboardingAccess,
  decideTenantAccess,
  type AccessFacts,
  type AccessGrant,
  type OnboardedClinicProfile,
  type OnboardingAccess,
} from "@nutri-bot/core";
import { resolveOnboardingSubscriptionAccess, type GetTenantSubscriptionGate } from "./onboarding-subscription-access";

export type { OnboardingAccess };

type OnboardingAccessDependencies = {
  readSession: () => Promise<{ userId?: string | null } | null>;
  loadAccessFacts: (userId: string) => Promise<AccessFacts | null>;
  existingEnabledTenantIds: readonly string[];
  loadOnboardedClinic: (tenantId: string) => Promise<OnboardedClinicProfile | null>;
  getTenantSubscriptionGate: GetTenantSubscriptionGate;
};

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
    const preClinic = decidePreClinicOnboardingAccess(grant, deps.existingEnabledTenantIds);
    if (preClinic) return preClinic;

    const clinic = await deps.loadOnboardedClinic(grant.tenantId);
    const setupDecision = decideOnboardedClinicSetupAccess(grant, clinic);
    if (setupDecision) return setupDecision;

    const subscription = await resolveOnboardingSubscriptionAccess(grant.tenantId, deps.getTenantSubscriptionGate);
    return decidePostSetupOnboardingAccess(grant, clinic!, subscription.status);
  }

  async function getOperationalGrant(): Promise<AccessGrant | null> {
    const access = await resolve();
    return access.kind === "operational" ? access.grant : null;
  }

  return { resolve, getOperationalGrant };
}
