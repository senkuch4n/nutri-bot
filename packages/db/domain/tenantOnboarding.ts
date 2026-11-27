import { Prisma, prisma } from "../index";

export type TenantOnboardingInput = Readonly<{
  userId: string;
  name: string;
  timeZone: string;
}>;

export type TenantOnboardingResult = Readonly<{
  tenantId: string;
  role: "OWNER";
  name: string;
  timeZone: string;
}>;

// The server caller supplies the user ID resolved from the verified Google identity.
export async function createOrResumeTenantOnboarding(
  input: TenantOnboardingInput,
): Promise<TenantOnboardingResult> {
  const name = input.name.trim();
  const timeZone = input.timeZone.trim();
  if (!name) throw new Error("Clinic name is required");
  if (!timeZone) throw new Error("Clinic time zone must be valid");
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch (error) {
    if (error instanceof RangeError) throw new Error("Clinic time zone must be valid");
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    // A user exists before any memberships do, so this also serializes first signup.
    const identities = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "User" WHERE id = ${input.userId}
        AND "googleSubject" IS NOT NULL AND "lastSignInAt" IS NOT NULL
      FOR UPDATE`;
    if (identities.length !== 1) throw new Error("Verified Google identity is required");

    const memberships = await tx.tenantMembership.findMany({
      where: { userId: input.userId },
      select: { role: true, tenant: { select: { id: true, name: true, timeZone: true } } },
      take: 2,
    });
    if (memberships.length) {
      const { role, tenant } = memberships[0]!;
      if (memberships.length !== 1 || role !== "OWNER" || !tenant.name || !tenant.timeZone) {
        throw new Error("The identity already belongs to a clinic outside onboarding");
      }
      return { tenantId: tenant.id, role, name: tenant.name, timeZone: tenant.timeZone };
    }

    const tenant = await tx.tenant.create({ data: { name, timeZone }, select: { id: true } });
    await tx.tenantMembership.create({
      data: { tenantId: tenant.id, userId: input.userId, role: "OWNER" },
    });
    return { tenantId: tenant.id, role: "OWNER", name, timeZone };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
