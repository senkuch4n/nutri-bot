import {
  decideOnboardingSubscriptionAccess,
  type OnboardingSubscriptionAccess,
  type TenantSubscriptionGate,
} from "@nutri-bot/core";

export type { OnboardingSubscriptionAccess, TenantSubscriptionGate };

export type GetTenantSubscriptionGate = (tenantId: string) => Promise<TenantSubscriptionGate>;

// The server adapter must supply a tenant ID resolved from trusted membership.
// This decision is only for new clinics; it does not replace tenant authorization.
export async function resolveOnboardingSubscriptionAccess(
  tenantId: string,
  getGate: GetTenantSubscriptionGate,
): Promise<OnboardingSubscriptionAccess> {
  try {
    return decideOnboardingSubscriptionAccess(await getGate(tenantId));
  } catch {
    return decideOnboardingSubscriptionAccess("pending");
  }
}
