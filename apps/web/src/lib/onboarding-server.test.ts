import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), loadAccessFacts: vi.fn(), findClinic: vi.fn(), createOrResumeClinic: vi.fn(), provisionClinic: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@nutri-bot/db", () => ({ prisma: { tenant: { findUnique: mocks.findClinic } } }));
vi.mock("@nutri-bot/db/domain/tenantAccess", () => ({ loadAccessFacts: mocks.loadAccessFacts }));
vi.mock("@nutri-bot/db/domain/tenantOnboarding", () => ({ createOrResumeTenantOnboarding: mocks.createOrResumeClinic }));
vi.mock("@nutri-bot/db/domain/tenantOnboardingProvisioning", () => ({ provisionOnboardedClinic: mocks.provisionClinic }));

import { createOnboardingServer } from "./onboarding-server";

const userId = "verified-user";
const tenantId = "trusted-clinic";
const legacyId = "legacy-tenant";
const name = "Consultorio del Sur";
const timeZone = "America/Montevideo";
const profile = { name, timeZone, agendas: [{ id: "primary-agenda" }] };
const facts = (id: string) => ({ linked: true, memberships: [{ tenantId: id, role: "OWNER" }], platformOperator: false, activeSupportGrants: [] });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId });
  mocks.loadAccessFacts.mockResolvedValue(facts(tenantId));
  mocks.findClinic.mockResolvedValue(profile);
  mocks.createOrResumeClinic.mockResolvedValue({ tenantId });
});

function setup() {
  const getTenantSubscriptionGate = vi.fn().mockResolvedValue("pending");
  const onComplete = vi.fn();
  const server = createOnboardingServer({ existingEnabledTenantIds: [legacyId], getTenantSubscriptionGate, onComplete });
  return { server, getTenantSubscriptionGate, onComplete };
}

it("resumes setup before checking subscription if there is no primary agenda", async () => {
  const { server, getTenantSubscriptionGate, onComplete } = setup();
  mocks.findClinic.mockResolvedValueOnce({ ...profile, agendas: [] });

  expect(await server.resolve()).toEqual({ kind: "setup", clinicName: name });
  expect(getTenantSubscriptionGate).not.toHaveBeenCalled();
  expect(mocks.findClinic.mock.calls).toEqual([[{
    where: { id: tenantId },
    select: { name: true, timeZone: true, agendas: { where: { isPrimary: true }, select: { id: true }, take: 1 } },
  }]]);

  const form = new FormData();
  form.set("name", name);
  form.set("professionalName", "Ana Sur");
  form.set("timeZone", timeZone);
  await server.submit(form);
  expect(mocks.createOrResumeClinic.mock.calls).toEqual([[{ userId, name, timeZone }]]);
  expect(mocks.provisionClinic.mock.calls).toEqual([[{ userId, expectedTenantId: tenantId, professionalName: "Ana Sur" }]]);
  expect(onComplete).toHaveBeenCalledOnce();
  expect(await server.resolve()).toEqual({ kind: "onboarding", clinicName: name });
  expect(await server.getOperationalGrant()).toBeNull();
});

it("does not grant operational access to an incomplete clinic even with a positive subscription dependency", async () => {
  const { server, getTenantSubscriptionGate } = setup();
  mocks.findClinic.mockResolvedValue({ ...profile, agendas: [] });
  getTenantSubscriptionGate.mockResolvedValue("verified");

  expect(await server.getOperationalGrant()).toBeNull();
  expect(getTenantSubscriptionGate).not.toHaveBeenCalled();
});

it("keeps the existing tenant eligible without depending on setup or subscription", async () => {
  const { server, getTenantSubscriptionGate } = setup();
  mocks.loadAccessFacts.mockResolvedValue(facts(legacyId));

  expect(await server.getOperationalGrant()).toEqual({ kind: "member", tenantId: legacyId, role: "OWNER" });
  expect(mocks.findClinic).not.toHaveBeenCalled();
  expect(getTenantSubscriptionGate).not.toHaveBeenCalled();
});
