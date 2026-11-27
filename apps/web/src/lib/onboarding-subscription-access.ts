export type TenantSubscriptionGate = "not_required" | "verified" | "pending";

export type GetTenantSubscriptionGate = (tenantId: string) => Promise<TenantSubscriptionGate>;

export type OnboardingSubscriptionAccess =
  | { status: "not_required" | "verified"; canOperate: true }
  | { status: "pending"; canOperate: false };

// The server adapter must supply a tenant ID resolved from trusted membership.
// This decision is only for new clinics; it does not replace tenant authorization.
export async function resolveOnboardingSubscriptionAccess(
  tenantId: string,
  getGate: GetTenantSubscriptionGate,
): Promise<OnboardingSubscriptionAccess> {
  let status: TenantSubscriptionGate;
  try {
    status = await getGate(tenantId);
  } catch {
    return { status: "pending", canOperate: false };
  }

  if (status === "not_required" || status === "verified") {
    return { status, canOperate: true };
  }
  return { status: "pending", canOperate: false };
}
