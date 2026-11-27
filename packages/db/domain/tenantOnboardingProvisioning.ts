import { Prisma, prisma } from "../index";

export type OnboardingProvisioningInput = Readonly<{ userId: string; professionalName: string; expectedTenantId: string }>;
export type OnboardingProvisioningResult = Readonly<{ tenantId: string; professionalId: number; agendaId: string }>;

type Membership = { tenantId: string; role: string; name: string | null; timeZone: string | null };

// The future server action supplies the identity from the verified session, not the form.
export async function provisionOnboardedClinic(
  input: OnboardingProvisioningInput,
): Promise<OnboardingProvisioningResult> {
  const professionalName = input.professionalName.trim();
  if (!professionalName) throw new Error("Professional name is required");

  return prisma.$transaction(async (tx) => {
    const [user] = await tx.$queryRaw<{ email: string }[]>`
      SELECT email FROM "User" WHERE id = ${input.userId}
        AND "googleSubject" IS NOT NULL AND "lastSignInAt" IS NOT NULL
      FOR UPDATE`;
    if (!user) throw new Error("Verified clinic owner is required");

    // Read membership from the database and serialize setup on the tenant row,
    // without blocking foreign-key checks that only need a key-share lock.
    const memberships = await tx.$queryRaw<Membership[]>`
      SELECT t.id AS "tenantId", m.role::text AS role, t.name, t."timeZone"
        FROM "TenantMembership" m JOIN "Tenant" t ON t.id = m."tenantId"
       WHERE m."userId" = ${input.userId}
       ORDER BY t.id LIMIT 2 FOR SHARE OF m FOR NO KEY UPDATE OF t`;
    const [membership] = memberships;
    if (memberships.length !== 1 || membership?.role !== "OWNER" || !membership.name || !membership.timeZone) {
      throw new Error("Verified clinic owner is required");
    }
    const { tenantId, timeZone } = membership;
    if (tenantId !== input.expectedTenantId) throw new Error("Clinic changed during signup");

    const existing = await tx.agenda.findFirst({
      where: { tenantId, isPrimary: true },
      select: { id: true, professionalId: true },
    });
    if (existing) return { tenantId, professionalId: existing.professionalId, agendaId: existing.id };

    // This infrequent path must coexist with writers that provide an explicit ID.
    // Serialize allocation with table writes and preserve the legacy DEFAULT 1.
    await tx.$executeRaw`LOCK TABLE "Professional" IN SHARE ROW EXCLUSIVE MODE`;
    const existingProfile = await tx.professional.findFirst({ where: { tenantId }, select: { id: true } });
    if (existingProfile) throw new Error("Clinic profile exists without a primary agenda");
    const [allocation] = await tx.$queryRaw<{ id: number }[]>`
      SELECT GREATEST(COALESCE(MAX(id), 0), 1) + 1 AS id FROM "Professional"`;
    if (!allocation) throw new Error("Could not allocate a professional ID");

    const professional = await tx.professional.create({
      data: { id: allocation.id, tenantId, name: professionalName, email: user.email, timezone: timeZone },
      select: { id: true },
    });
    const agenda = await tx.agenda.create({
      data: { tenantId, professionalId: professional.id, isPrimary: true },
      select: { id: true },
    });
    return { tenantId, professionalId: professional.id, agendaId: agenda.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
