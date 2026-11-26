import "server-only";
import { prisma } from "@nutri-bot/db";
import { loadAccessFacts } from "@nutri-bot/db/domain/tenantAccess";
import { createOrResumeTenantOnboarding } from "@nutri-bot/db/domain/tenantOnboarding";
import { provisionOnboardedClinic } from "@nutri-bot/db/domain/tenantOnboardingProvisioning";
import { auth } from "@/auth";
import { createOnboardingAccessAdapter } from "./onboarding-access-adapter";
import { createOnboardingSignupAction } from "./onboarding-signup-action";
import type { GetTenantSubscriptionGate } from "./onboarding-subscription-access";

type OnboardingServerConfiguration = {
  existingEnabledTenantIds: readonly string[];
  getTenantSubscriptionGate: GetTenantSubscriptionGate;
  onComplete: () => void | Promise<void>;
};

// Public self-signup stays disabled by default until HU-029b and end-to-end verification are complete.
export function isPublicOnboardingEnabled(): boolean {
  return process.env.NUTRIBOT_PUBLIC_ONBOARDING_ENABLED === "true";
}

export async function loadOnboardedClinic(tenantId: string): Promise<{ name: string; setupComplete: boolean } | null> {
  const clinic = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, timeZone: true, agendas: { where: { isPrimary: true }, select: { id: true }, take: 1 } },
  });
  if (!clinic?.name || !clinic.timeZone) return null;
  return { name: clinic.name, setupComplete: clinic.agendas.length === 1 };
}

export function createOnboardingServer(configuration: OnboardingServerConfiguration) {
  const readSession = () => auth();
  const access = createOnboardingAccessAdapter({
    readSession,
    existingEnabledTenantIds: configuration.existingEnabledTenantIds,
    getTenantSubscriptionGate: configuration.getTenantSubscriptionGate,
    loadAccessFacts: (userId) => loadAccessFacts(userId, new Date()),
    loadOnboardedClinic,
  });

  return {
    ...access,
    submit: createOnboardingSignupAction({
      readSession,
      createOrResumeClinic: createOrResumeTenantOnboarding,
      provisionClinic: provisionOnboardedClinic,
      onComplete: configuration.onComplete,
    }),
  };
}
