// HU-025 (4.3): agenda principal por tenant, con Prisma mockeado.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { agenda: { findFirst: vi.fn(), findUnique: vi.fn() }, $queryRaw: vi.fn() },
}));
vi.mock("../index", () => ({ prisma: mocks.prisma }));

import {
  findTenantProfessionalSummary,
  getTenantProfessional,
  lockTenantScheduling,
  resolveTenantCalendarContext,
  resolveTenantDigestContext,
  resolveTenantSchedulingContext,
  TenantScopeError,
} from "./tenantScope";
import { resolveLegacyCalendarScope, resolveLegacySchedulingScope } from "./legacySchedulingScope";
import { PROFESSIONAL_SELECT } from "./professionalSelect";

const TZ = "America/Argentina/Buenos_Aires";

function agendaOf(tenantId: string, id: string, professionalId: number, professional: Record<string, unknown>) {
  return { id, tenantId, professionalId, professional };
}

beforeEach(() => vi.resetAllMocks());

describe("resolveTenantSchedulingContext", () => {
  it("devuelve la agenda principal del tenant pedido y su profesional", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue(agendaOf("tenant-b", "agenda-b", 7, { timezone: TZ, phoneJid: null }));

    const ctx = await resolveTenantSchedulingContext(mocks.prisma as never, "tenant-b");

    expect(ctx).toEqual({ scope: { tenantId: "tenant-b", agendaId: "agenda-b" }, professional: { timezone: TZ, phoneJid: null } });
    const args = mocks.prisma.agenda.findFirst.mock.calls[0]![0];
    expect(args.where).toEqual({ tenantId: "tenant-b", isPrimary: true });
    expect(args.select.professional).toEqual({ select: { timezone: true, phoneJid: true } });
  });

  it("sin agenda principal → TenantScopeError tenant_scope_missing", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue(null);
    const err = await resolveTenantSchedulingContext(mocks.prisma as never, "tenant-x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TenantScopeError);
    expect((err as TenantScopeError).code).toBe("tenant_scope_missing");
    // El mensaje no lleva el id del tenant.
    expect((err as Error).message).not.toContain("tenant-x");
  });

  it("tenantId vacío → error sin consultar", async () => {
    await expect(resolveTenantSchedulingContext(mocks.prisma as never, "")).rejects.toBeInstanceOf(TenantScopeError);
    expect(mocks.prisma.agenda.findFirst).not.toHaveBeenCalled();
  });

  it("una fila que no es del tenant pedido (defensa) → error, nunca el scope de otro", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue(agendaOf("tenant-a", "agenda-a", 1, { timezone: TZ, phoneJid: null }));
    await expect(resolveTenantSchedulingContext(mocks.prisma as never, "tenant-b")).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("la profesional sale de la relación de la agenda (FK compuesta, mismo tenant): no hay consulta aparte por id", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue(agendaOf("tenant-b", "agenda-b", 7, { timezone: TZ, phoneJid: "b@s" }));
    await resolveTenantSchedulingContext(mocks.prisma as never, "tenant-b");
    expect(mocks.prisma.agenda.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.agenda.findUnique).not.toHaveBeenCalled();
  });
});

describe("digest y calendario", () => {
  it("digest suma los campos de fuera de horario", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue(agendaOf("t", "ag", 3, { timezone: TZ }));
    await resolveTenantDigestContext(mocks.prisma as never, "t");
    expect(mocks.prisma.agenda.findFirst.mock.calls[0]![0].select.professional.select).toMatchObject({
      afterHoursEnabled: true, afterHoursStart: true, afterHoursEnd: true,
    });
  });

  it("calendario devuelve agendaOwner con la profesional de la agenda", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue(agendaOf("t", "ag", 3, { timezone: TZ, googleRefreshToken: null }));
    const ctx = await resolveTenantCalendarContext(mocks.prisma as never, "t");
    expect(ctx.agendaOwner).toEqual({ isPrimary: true, professionalId: 3 });
    expect(ctx.scope).toEqual({ tenantId: "t", agendaId: "ag" });
  });
});

describe("getTenantProfessional / findTenantProfessionalSummary", () => {
  it("getTenantProfessional usa PROFESSIONAL_SELECT (sin bytes de imágenes)", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue(agendaOf("t", "ag", 3, { id: 3, name: "Lic. B" }));
    const pro = await getTenantProfessional("t");
    expect(pro).toEqual({ id: 3, name: "Lic. B" });
    expect(mocks.prisma.agenda.findFirst.mock.calls[0]![0].select.professional.select).toBe(PROFESSIONAL_SELECT);
  });

  it("getTenantProfessional sin agenda → tira", async () => {
    mocks.prisma.agenda.findFirst.mockResolvedValue(null);
    await expect(getTenantProfessional("t")).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("findTenantProfessionalSummary nunca tira", async () => {
    mocks.prisma.agenda.findFirst.mockRejectedValue(new Error("db down"));
    await expect(findTenantProfessionalSummary("t")).resolves.toBeNull();
    mocks.prisma.agenda.findFirst.mockResolvedValue(null);
    await expect(findTenantProfessionalSummary("t")).resolves.toBeNull();
    mocks.prisma.agenda.findFirst.mockResolvedValue(agendaOf("t", "ag", 3, { name: "N", title: null, phoneJid: null, botPaused: false }));
    await expect(findTenantProfessionalSummary("t")).resolves.toEqual({ name: "N", title: null, phoneJid: null, botPaused: false });
  });
});

describe("lockTenantScheduling", () => {
  it("bloquea la profesional de la agenda principal del tenant", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ id: 3 }]);
    await expect(lockTenantScheduling(mocks.prisma as never, "t")).resolves.toBe(true);
    const [strings, ...values] = mocks.prisma.$queryRaw.mock.calls[0]!;
    expect((strings as string[]).join("?")).toContain("FOR UPDATE OF p");
    expect(values).toEqual(["t"]);
  });

  it("sin fila → false", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    await expect(lockTenantScheduling(mocks.prisma as never, "t")).resolves.toBe(false);
  });
});

describe("fachada legacy", () => {
  it("sigue verificando legacy-agenda y Professional(1)", async () => {
    mocks.prisma.agenda.findUnique.mockResolvedValue({ professional: { timezone: TZ, phoneJid: null } });
    const ctx = await resolveLegacySchedulingScope();
    expect(ctx.scope).toEqual({ tenantId: "legacy-tenant", agendaId: "legacy-agenda" });
    expect(mocks.prisma.agenda.findUnique.mock.calls[0]![0].where).toEqual({
      id_tenantId: { id: "legacy-agenda", tenantId: "legacy-tenant" }, isPrimary: true, professionalId: 1,
    });
  });

  it("calendario legacy: agendaOwner fijo", async () => {
    mocks.prisma.agenda.findUnique.mockResolvedValue({ professional: { timezone: TZ } });
    const ctx = await resolveLegacyCalendarScope();
    expect(ctx.agendaOwner).toEqual({ isPrimary: true, professionalId: 1 });
  });

  it("sin la agenda legacy → tira", async () => {
    mocks.prisma.agenda.findUnique.mockResolvedValue(null);
    await expect(resolveLegacySchedulingScope()).rejects.toThrow();
  });
});
