// HU-026: real server action and real API route enforcement through tenant-context.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantSubscriptionGate } from "./onboarding-subscription-access";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  loadAccessFacts: vi.fn(),
  loadOnboardedClinic: vi.fn(),
  getTenantSubscriptionGate: vi.fn<(_tenantId: string) => Promise<TenantSubscriptionGate>>(),
  resolvePrimaryAgenda: vi.fn(),
  removeTenantMember: vi.fn(),
  appointmentFindMany: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  TenantScopeError: class TenantScopeError extends Error {},
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/onboarding-server", () => ({ loadOnboardedClinic: mocks.loadOnboardedClinic }));
vi.mock("@/lib/onboarding-subscription-gate", () => ({ getTenantSubscriptionGate: mocks.getTenantSubscriptionGate }));
vi.mock("@nutri-bot/db", () => ({
  prisma: { appointment: { findMany: mocks.appointmentFindMany } },
}));
vi.mock("@nutri-bot/db/domain", () => ({
  LEGACY_TENANT_ID: "legacy-tenant",
  loadAccessFacts: mocks.loadAccessFacts,
  removeTenantMember: mocks.removeTenantMember,
  TenantScopeError: mocks.TenantScopeError,
  resolvePrimaryAgenda: mocks.resolvePrimaryAgenda,
}));

import { removeTeamMemberAction } from "@/app/(panel)/ajustes/team-actions";
import { GET as getAppointments } from "@/app/api/appointments/route";

const ownerFacts = {
  linked: true,
  memberships: [{ tenantId: "clinic-new", role: "OWNER" as const }],
  platformOperator: false,
  activeSupportGrants: [],
};

describe("HU-026 real guard enforcement (panel action + API route)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner-1", user: { email: "ana@example.test" } });
    mocks.loadAccessFacts.mockResolvedValue(ownerFacts);
    mocks.loadOnboardedClinic.mockResolvedValue({ name: "Consultorio Sur", setupComplete: true });
    mocks.getTenantSubscriptionGate.mockResolvedValue("pending");
    mocks.resolvePrimaryAgenda.mockResolvedValue({
      scope: { tenantId: "clinic-new", agendaId: "agenda-new" },
      professionalId: 42,
      professional: {},
    });
    mocks.removeTenantMember.mockResolvedValue({ ok: true });
    mocks.appointmentFindMany.mockResolvedValue([]);
  });

  it.each(["pending", "error"] as const)("blocks real mutating action and API with zero writes on %s", async (state) => {
    if (state === "error") mocks.getTenantSubscriptionGate.mockRejectedValue(new Error("gate unavailable"));

    const fd = new FormData();
    fd.set("userId", "staff-1");
    const actionRes = await removeTeamMemberAction(null, fd);
    expect(actionRes).toMatchObject({ ok: false, reauth: true });
    expect(mocks.removeTenantMember).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    const apiRes = await getAppointments(
      new Request("https://panel.example.test/api/appointments?from=2030-01-01T00:00:00Z&to=2030-01-02T00:00:00Z"),
    );
    expect(apiRes.status).toBe(401);
    expect(mocks.appointmentFindMany).not.toHaveBeenCalled();
  });

  it.each(["not_required", "verified"] as const)("allows real action and API for completed clinic on %s", async (gate) => {
    mocks.getTenantSubscriptionGate.mockResolvedValue(gate);

    const fd = new FormData();
    fd.set("userId", "staff-1");
    const actionRes = await removeTeamMemberAction(null, fd);
    expect(actionRes).toEqual({ ok: true });
    expect(mocks.removeTenantMember).toHaveBeenCalledWith({
      tenantId: "clinic-new",
      actorUserId: "owner-1",
      targetUserId: "staff-1",
    });

    const apiRes = await getAppointments(
      new Request("https://panel.example.test/api/appointments?from=2030-01-01T00:00:00Z&to=2030-01-02T00:00:00Z"),
    );
    expect(apiRes.status).toBe(200);
    expect(mocks.appointmentFindMany).toHaveBeenCalledOnce();
  });
});
