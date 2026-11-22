import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, findUser } = vi.hoisted(() => ({ auth: vi.fn(), findUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../auth", () => ({ auth }));
vi.mock("@nutri-bot/db", () => ({ prisma: { user: { findFirst: findUser } } }));

import { resolvePrivateContentAccess } from "./private-content-access";

const membership = { tenantId: "tenant-a", role: "OWNER" };

describe("resolvePrivateContentAccess", () => {
  beforeEach(() => {
    auth.mockReset().mockResolvedValue({ userId: "user-a" });
    findUser.mockReset();
  });

  it.each([
    null,
    { user: { email: "legacy@example.invalid", id: "user-a" }, tenantId: "tenant-a" },
    // JWT anterior a HU-025: solo trae el claim viejo, hay que volver a entrar.
    { user: { email: "legacy@example.invalid" }, privateContentUserId: "user-a" },
  ])(
    "denies a missing or unbound session (%j)", async (session) => {
      auth.mockResolvedValue(session);
      expect(await resolvePrivateContentAccess()).toBeNull();
      expect(findUser).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { memberships: [] },
    { memberships: [membership, { ...membership, tenantId: "tenant-b" }] },
    { memberships: [{ ...membership, role: "UNSUPPORTED" }] },
  ])("denies a missing user, missing or ambiguous membership, or unauthorized role (%j)", async (user) => {
    findUser.mockResolvedValue(user);
    expect(await resolvePrivateContentAccess()).toBeNull();
  });

  it.each([
    ["user-a", "tenant-a", "OWNER"],
    ["user-b", "tenant-b", "STAFF"],
  ])("resolves %s from persisted membership in %s (%s)", async (userId, tenantId, role) => {
    auth.mockResolvedValue({ userId, tenantId: "forged", role: "forged" });
    findUser.mockResolvedValue({ memberships: [{ tenantId, role }] });
    expect(await resolvePrivateContentAccess()).toEqual({ userId, tenantId, role });
    expect(auth).toHaveBeenCalledTimes(1);
    expect(auth).toHaveBeenCalledWith();
    expect(findUser).toHaveBeenCalledTimes(1);
    expect(findUser).toHaveBeenCalledWith({
      where: { id: userId, googleSubject: { not: null } },
      select: { memberships: { take: 2, select: { tenantId: true, role: true } } },
    });
  });

  it("rechecks revoked membership on the next operation without a new session", async () => {
    findUser.mockResolvedValueOnce({ memberships: [membership] }).mockResolvedValueOnce({ memberships: [] });
    expect(await resolvePrivateContentAccess()).toEqual({ ...membership, userId: "user-a" });
    expect(await resolvePrivateContentAccess()).toBeNull();
    expect(findUser).toHaveBeenCalledTimes(2);
  });
});
