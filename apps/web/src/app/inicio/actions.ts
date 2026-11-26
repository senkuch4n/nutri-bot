"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOnboardingServer, isPublicOnboardingEnabled } from "@/lib/onboarding-server";
import { getTenantSubscriptionGate } from "@/lib/onboarding-subscription-gate";
import { ENABLED_TENANT_IDS } from "@/lib/tenant-context";

export async function submitOnboardingClinicAction(formData: FormData): Promise<void> {
  const server = createOnboardingServer({
    existingEnabledTenantIds: ENABLED_TENANT_IDS,
    getTenantSubscriptionGate,
    onComplete: () => {
      revalidatePath("/inicio");
      revalidatePath("/");
    },
  });

  if (!isPublicOnboardingEnabled()) {
    const current = await server.resolve();
    if (current.kind !== "setup") {
      throw new Error("Public onboarding is disabled");
    }
  }

  await server.submit(formData);
  const next = await server.resolve();
  redirect(next.kind === "operational" ? "/" : "/inicio");
}
