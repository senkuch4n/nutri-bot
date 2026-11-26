import "server-only";
import type { GetTenantSubscriptionGate, TenantSubscriptionGate } from "./onboarding-subscription-access";

// Temporary fail-closed stub until HU-029b exposes getTenantSubscriptionGate from @nutri-bot/db/domain.
export const getTenantSubscriptionGate: GetTenantSubscriptionGate = async (
  _tenantId: string,
): Promise<TenantSubscriptionGate> => "pending";
