import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  submit: vi.fn(),
  isPublicOnboardingEnabled: vi.fn(() => false),
  createOnboardingServer: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/tenant-context", () => ({ ENABLED_TENANT_IDS: ["legacy-tenant"] }));
vi.mock("@/lib/onboarding-subscription-gate", () => ({ getTenantSubscriptionGate: vi.fn() }));
vi.mock("@/lib/onboarding-server", () => ({
  isPublicOnboardingEnabled: mocks.isPublicOnboardingEnabled,
  createOnboardingServer: mocks.createOnboardingServer,
}));

import { submitOnboardingClinicAction } from "./actions";

describe("submitOnboardingClinicAction", () => {
  const form = () => {
    const fd = new FormData();
    fd.set("name", "Consultorio Sur");
    fd.set("professionalName", "Dra. Ana Sur");
    fd.set("timeZone", "America/Montevideo");
    return fd;
  };

  const submittedValues = {
    name: "Consultorio Sur",
    professionalName: "Dra. Ana Sur",
    timeZone: "America/Montevideo",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPublicOnboardingEnabled.mockReturnValue(false);
    mocks.resolve.mockReset().mockResolvedValue({ kind: "denied", reason: "no_membership" });
    mocks.submit.mockReset().mockResolvedValue(undefined);
    mocks.createOnboardingServer.mockImplementation((cfg: { onComplete: () => void }) => ({
      resolve: mocks.resolve,
      submit: async (fd: FormData, resumeTenantId?: string) => {
        await mocks.submit(fd, resumeTenantId);
        cfg.onComplete();
      },
    }));
  });

  it("blocks new signups on the server when public onboarding is disabled", async () => {
    mocks.resolve.mockResolvedValue({ kind: "denied", reason: "no_membership" });
    const result = await submitOnboardingClinicAction(null, form());
    expect(result).toEqual({
      error: "El alta de nuevos consultorios no está habilitada todavía.",
      values: submittedValues,
    });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["unauthenticated", "unlinked"] as const)(
    "returns session-expired message for %s even when public onboarding is disabled",
    async (reason) => {
      mocks.resolve.mockResolvedValue({ kind: "denied", reason });
      const result = await submitOnboardingClinicAction(null, form());
      expect(result).toEqual({
        error: "Tu sesión venció. Volvé a iniciar sesión con Google.",
        values: submittedValues,
      });
      expect(mocks.submit).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it("redirects operational users to / without re-running provisioning even with flag enabled", async () => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(true);
    mocks.resolve.mockResolvedValue({
      kind: "operational",
      grant: { kind: "member", tenantId: "c1", role: "OWNER" },
    });

    await expect(submitOnboardingClinicAction(null, form())).rejects.toMatchObject({ url: "/" });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("redirects onboarding users to /inicio without re-running provisioning even with flag enabled", async () => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(true);
    mocks.resolve.mockResolvedValue({ kind: "onboarding", clinicName: "Consultorio Sur" });

    await expect(submitOnboardingClinicAction(null, form())).rejects.toMatchObject({ url: "/inicio" });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("redirects non-signup denied states to /inicio without running provisioning", async () => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(true);
    mocks.resolve.mockResolvedValue({ kind: "denied", reason: "multiple_memberships" });

    await expect(submitOnboardingClinicAction(null, form())).rejects.toMatchObject({ url: "/inicio" });
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([false, true])("resumes only the server-resolved clinic (public flag %s)", async (enabled) => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(enabled);
    mocks.resolve
      .mockResolvedValueOnce({
        kind: "setup",
        tenantId: "saved-clinic",
        clinicName: "Consultorio guardado",
        timeZone: "America/Argentina/Buenos_Aires",
      })
      .mockResolvedValueOnce({ kind: "onboarding", clinicName: "Consultorio guardado" });

    await expect(submitOnboardingClinicAction(null, form())).rejects.toMatchObject({ url: "/inicio" });
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.submit).toHaveBeenCalledWith(expect.any(FormData), "saved-clinic");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inicio");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("redirects to / when public onboarding is enabled and subscription allows operation", async () => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(true);
    mocks.resolve
      .mockResolvedValueOnce({ kind: "denied", reason: "no_membership" })
      .mockResolvedValueOnce({ kind: "operational", grant: { kind: "member", tenantId: "c1", role: "OWNER" } });

    await expect(submitOnboardingClinicAction(null, form())).rejects.toMatchObject({ url: "/" });
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.submit).toHaveBeenCalledWith(expect.any(FormData), undefined);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inicio");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("redirects to /inicio when public onboarding is enabled and subscription stays pending", async () => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(true);
    mocks.resolve
      .mockResolvedValueOnce({ kind: "denied", reason: "no_membership" })
      .mockResolvedValueOnce({ kind: "onboarding", clinicName: "Consultorio Sur" });

    await expect(submitOnboardingClinicAction(null, form())).rejects.toMatchObject({ url: "/inicio" });
    expect(mocks.submit).toHaveBeenCalledOnce();
  });

  it.each([
    ["Required setup field: name", "Ingresá el nombre del consultorio."],
    ["Required setup field: professionalName", "Ingresá el nombre profesional que querés mostrar."],
    ["Invalid time zone", "Elegí una zona horaria válida."],
    ["Verified identity is required", "Tu sesión venció. Volvé a iniciar sesión con Google."],
    ["Verified Google identity is required", "Tu sesión venció. Volvé a iniciar sesión con Google."],
    ["Verified clinic owner is required", "Solo la titular verificada del consultorio puede completar esta configuración."],
    [
      "The identity already belongs to a clinic outside onboarding",
      "Esta cuenta de Google ya pertenece a un consultorio. Recargá la página o usá otra cuenta.",
    ],
    ["Clinic changed during signup", "El estado de tu consultorio cambió durante el alta. Recargá la página para continuar."],
    ["ECONNREFUSED postgres://secret", "No pudimos guardar la configuración. Intentá de nuevo en unos momentos."],
  ])("maps %s to a safe user-facing error while preserving submitted values", async (rawError, expected) => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(true);
    mocks.submit.mockRejectedValueOnce(new Error(rawError));

    const result = await submitOnboardingClinicAction(null, form());
    expect(result).toEqual({
      error: expected,
      values: submittedValues,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
