// HU-026 signup integration tests against disposable PostgreSQL only.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { prisma } from "../index";
import { loadAccessFacts, registerGoogleIdentity } from "../domain/tenantAccess";
import { createOrResumeTenantOnboarding } from "../domain/tenantOnboarding";

if (
  process.env.TENANT_ONBOARDING_DISPOSABLE !== "1" ||
  !/^postgresql:\/\/postgres:[a-f0-9]{36}@127\.0\.0\.1:\d+\/tenant_onboarding$/.test(
    process.env.DATABASE_URL ?? "",
  )
) {
  throw new Error(
    "Refusing to run without TENANT_ONBOARDING_DISPOSABLE=1 and a disposable localhost tenant_onboarding DATABASE_URL.",
  );
}

const now = new Date("2026-11-25T22:00:00.000Z");
const later = new Date("2026-11-25T22:05:00.000Z");

after(async () => {
  await prisma.$disconnect();
});

async function createVerifiedIdentity(subject: string, email: string): Promise<string> {
  const reg = await registerGoogleIdentity({ subject, email }, now, prisma);
  assert.equal(reg.status, "linked");
  return reg.userId;
}

test("Alta 1: two verified identities create separate clinics and each resumes only its own as OWNER", async () => {
  const userA = await createVerifiedIdentity("hu026-sub-alpha", "alpha@example.test");
  const userB = await createVerifiedIdentity("hu026-sub-beta", "beta@example.test");

  const clinicA = await createOrResumeTenantOnboarding({
    userId: userA,
    name: "Consultorio Alpha",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const clinicB = await createOrResumeTenantOnboarding({
    userId: userB,
    name: "Consultorio Beta",
    timeZone: "America/Montevideo",
  });

  assert.equal(clinicA.role, "OWNER");
  assert.equal(clinicB.role, "OWNER");
  assert.notEqual(clinicA.tenantId, clinicB.tenantId);

  const factsA = await loadAccessFacts(userA, later, prisma);
  const factsB = await loadAccessFacts(userB, later, prisma);
  assert.deepEqual(factsA?.memberships, [{ tenantId: clinicA.tenantId, role: "OWNER" }]);
  assert.deepEqual(factsB?.memberships, [{ tenantId: clinicB.tenantId, role: "OWNER" }]);

  const resumedA = await createOrResumeTenantOnboarding({
    userId: userA,
    name: "Consultorio Alpha",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const resumedB = await createOrResumeTenantOnboarding({
    userId: userB,
    name: "Consultorio Beta",
    timeZone: "America/Montevideo",
  });
  assert.deepEqual(resumedA, { tenantId: clinicA.tenantId, role: "OWNER", name: "Consultorio Alpha", timeZone: "America/Argentina/Buenos_Aires" });
  assert.deepEqual(resumedB, { tenantId: clinicB.tenantId, role: "OWNER", name: "Consultorio Beta", timeZone: "America/Montevideo" });
});

test("Alta 2: sequential, parallel, and post-re-login retries return the same clinic without duplicating tenant or OWNER membership", async () => {
  const subject = "hu026-sub-retry";
  const email = "retry@example.test";
  const userId = await createVerifiedIdentity(subject, email);
  const tenantsBefore = await prisma.tenant.count();

  const parallel = await Promise.all(
    Array.from({ length: 6 }, () =>
      createOrResumeTenantOnboarding({
        userId,
        name: "Consultorio Concurrente",
        timeZone: "America/Argentina/Buenos_Aires",
      }),
    ),
  );

  const uniqueTenantIds = new Set(parallel.map((r) => r.tenantId));
  assert.equal(uniqueTenantIds.size, 1);
  const [tenantId] = uniqueTenantIds;
  assert.ok(tenantId);
  for (const res of parallel) {
    assert.equal(res.role, "OWNER");
  }

  // Re-login with the same Google identity and retry onboarding.
  const relogin = await registerGoogleIdentity({ subject, email }, later, prisma);
  assert.deepEqual(relogin, { status: "linked", userId });

  const afterRelogin = await createOrResumeTenantOnboarding({
    userId,
    name: "Consultorio Concurrente",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  assert.equal(afterRelogin.tenantId, tenantId);
  assert.equal(afterRelogin.role, "OWNER");

  const tenantsAfter = await prisma.tenant.count();
  assert.equal(tenantsAfter, tenantsBefore + 1);

  const memberships = await prisma.tenantMembership.findMany({ where: { userId } });
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0]?.tenantId, tenantId);
  assert.equal(memberships[0]?.role, "OWNER");

  const facts = await loadAccessFacts(userId, later, prisma);
  assert.deepEqual(facts?.memberships, [{ tenantId, role: "OWNER" }]);
});

test("Alta 3: membership creation failure rolls back without an orphaned clinic and allows a clean retry", async () => {
  const userId = await createVerifiedIdentity("hu026-sub-rollback", "rollback@example.test");
  const tenantsBefore = await prisma.tenant.count();

  // Inject a real database failure only for the synthetic identity in this case.
  await prisma.$executeRaw`
    CREATE FUNCTION hu026_fail_membership() RETURNS trigger AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM "User" WHERE id = NEW."userId" AND "googleSubject" = 'hu026-sub-rollback') THEN
        RAISE EXCEPTION 'simulated membership creation failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`;
  await prisma.$executeRaw`
    CREATE TRIGGER hu026_fail_membership_trg
      BEFORE INSERT ON "TenantMembership"
      FOR EACH ROW EXECUTE FUNCTION hu026_fail_membership()`;

  try {
    await assert.rejects(
      () =>
        createOrResumeTenantOnboarding({
          userId,
          name: "Consultorio Rollback",
          timeZone: "America/Argentina/Buenos_Aires",
        }),
      /simulated membership creation failure/,
    );
  } finally {
    await prisma.$executeRaw`DROP TRIGGER hu026_fail_membership_trg ON "TenantMembership"`;
    await prisma.$executeRaw`DROP FUNCTION hu026_fail_membership()`;
  }

  // No orphaned clinic and no membership left behind.
  assert.equal(await prisma.tenant.count(), tenantsBefore);
  const factsAfterFailure = await loadAccessFacts(userId, later, prisma);
  assert.deepEqual(factsAfterFailure?.memberships, []);

  // Subsequent valid retry produces a single complete onboarding.
  const recovered = await createOrResumeTenantOnboarding({
    userId,
    name: "Consultorio Rollback",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  assert.equal(recovered.role, "OWNER");
  assert.ok(recovered.tenantId);

  assert.equal(await prisma.tenant.count(), tenantsBefore + 1);
  const factsAfterRetry = await loadAccessFacts(userId, later, prisma);
  assert.deepEqual(factsAfterRetry?.memberships, [{ tenantId: recovered.tenantId, role: "OWNER" }]);
});
