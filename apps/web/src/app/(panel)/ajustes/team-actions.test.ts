// HU-025 (025b-2 M11, 7.2.1): "Quitar acceso" en Ajustes → Equipo. Contexto y dominio mockeados.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEAM_TEXT } from "@nutri-bot/core";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), remove: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/tenant-context", () => ({ requireOwnerContext: mocks.owner }));
vi.mock("@nutri-bot/db/domain", () => ({ removeTenantMember: mocks.remove }));

import { removeTeamMemberAction } from "./team-actions";

const OWNER_A = {
  userId: "u-owner", tenantId: "tenant-a", agendaId: "agenda-a", professionalId: 1,
  access: { kind: "member", tenantId: "tenant-a", role: "OWNER" },
};

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.owner.mockResolvedValue(OWNER_A);
  mocks.remove.mockResolvedValue({ ok: true });
});

describe("removeTeamMemberAction", () => {
  it("quita con el tenant y el actor del contexto; del form solo lee el userId objetivo", async () => {
    const res = await removeTeamMemberAction(null, form({ userId: "u-staff", tenantId: "tenant-b", actorUserId: "u-x" }));
    expect(res).toEqual({ ok: true });
    expect(mocks.remove).toHaveBeenCalledWith({ tenantId: "tenant-a", actorUserId: "u-owner", targetUserId: "u-staff" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ajustes");
  });

  it("STAFF o soporte (requireOwnerContext rechaza) → error genérico + reauth, sin tocar el dominio", async () => {
    mocks.owner.mockRejectedValue(new Error("tenant_access:owner_only"));
    expect(await removeTeamMemberAction(null, form({ userId: "u-staff" }))).toEqual({ ok: false, error: TEAM_TEXT.genericError, reauth: true });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("quitarse a sí misma → texto propio", async () => {
    mocks.remove.mockResolvedValue({ ok: false, reason: "self" });
    expect(await removeTeamMemberAction(null, form({ userId: "u-owner" }))).toEqual({ ok: false, error: TEAM_TEXT.selfError });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("última responsable → texto propio", async () => {
    mocks.remove.mockResolvedValue({ ok: false, reason: "last_owner" });
    expect(await removeTeamMemberAction(null, form({ userId: "u-owner-2" }))).toEqual({ ok: false, error: TEAM_TEXT.lastOwnerError });
  });

  it("objetivo de otro consultorio → mismo error genérico que uno inexistente, y el log no lleva ids ni emails", async () => {
    mocks.remove.mockResolvedValue({ ok: false, reason: "not_member" });
    expect(await removeTeamMemberAction(null, form({ userId: "u-de-b" }))).toEqual({ ok: false, error: TEAM_TEXT.genericError });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("reason=not_member");
    expect(logged).not.toContain("u-de-b");
  });

  it("userId vacío o demasiado largo → genérico sin llamar al dominio", async () => {
    expect(await removeTeamMemberAction(null, form({ userId: "" }))).toEqual({ ok: false, error: TEAM_TEXT.genericError });
    expect(await removeTeamMemberAction(null, form({ userId: "x".repeat(65) }))).toEqual({ ok: false, error: TEAM_TEXT.genericError });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("si la base falla → genérico, log solo con código", async () => {
    mocks.remove.mockRejectedValue(Object.assign(new Error("db down: ana@example.com"), { code: "P1001" }));
    expect(await removeTeamMemberAction(null, form({ userId: "u-staff" }))).toEqual({ ok: false, error: TEAM_TEXT.genericError });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("P1001");
    expect(logged).not.toContain("ana@example.com");
  });
});
