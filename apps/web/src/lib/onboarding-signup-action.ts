import "server-only";

type SignupActionDependencies = {
  readSession: () => Promise<{ userId?: string | null } | null>;
  createOrResumeClinic: (input: { userId: string; name: string; timeZone: string }) => Promise<{ tenantId: string }>;
  provisionClinic: (input: { userId: string; professionalName: string; expectedTenantId: string }) => Promise<unknown>;
  onComplete: () => void | Promise<void>;
};

function readRequiredText(formData: FormData, field: "name" | "professionalName" | "timeZone"): string {
  const value = formData.get(field);
  if (typeof value !== "string" || !value.trim()) throw new Error(`Required setup field: ${field}`);
  return value.trim();
}

export function createOnboardingSignupAction(deps: SignupActionDependencies) {
  return async (formData: FormData, resumeTenantId?: string): Promise<void> => {
    const session = await deps.readSession();
    if (!session?.userId) throw new Error("Verified identity is required");
    const { userId } = session;

    const professionalName = readRequiredText(formData, "professionalName");
    const expectedTenantId = resumeTenantId ?? (await deps.createOrResumeClinic({
      userId,
      name: readRequiredText(formData, "name"),
      timeZone: readRequiredText(formData, "timeZone"),
    })).tenantId;
    await deps.provisionClinic({ userId, professionalName, expectedTenantId });
    await deps.onComplete();
  };
}
