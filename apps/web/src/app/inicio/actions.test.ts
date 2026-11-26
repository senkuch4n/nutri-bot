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

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPublicOnboardingEnabled.mockReturnValue(false);
    mocks.createOnboardingServer.mockImplementation((cfg: { onComplete: () => void }) => ({
      resolve: mocks.resolve,
      submit: async (fd: FormData) => {
        await mocks.submit(fd);
        cfg.onComplete();
      },
    }));
  });

  it("blocks new signups on the server when public onboarding is disabled", async () => {
    mocks.resolve.mockResolvedValue({ kind: "denied", reason: "no_membership" });
    await expect(submitOnboardingClinicAction(form())).rejects.toThrow("Public onboarding is disabled");
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("allows resuming an incomplete clinic setup even when public onboarding is disabled", async () => {
    mocks.resolve
      .mockResolvedValueOnce({ kind: "setup", clinicName: "Consultorio Sur" })
      .mockResolvedValueOnce({ kind: "onboarding", clinicName: "Consultorio Sur" });

    await expect(submitOnboardingClinicAction(form())).rejects.toMatchObject({ url: "/inicio" });
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inicio");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("redirects to / when public onboarding is enabled and subscription allows operation", async () => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(true);
    mocks.resolve.mockResolvedValue({ kind: "operational", grant: { kind: "member", tenantId: "c1", role: "OWNER" } });

    await expect(submitOnboardingClinicAction(form())).rejects.toMatchObject({ url: "/" });
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inicio");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("redirects to /inicio when public onboarding is enabled and subscription stays pending", async () => {
    mocks.isPublicOnboardingEnabled.mockReturnValue(true);
    mocks.resolve.mockResolvedValue({ kind: "onboarding", clinicName: "Consultorio Sur" });

    await expect(submitOnboardingClinicAction(form())).rejects.toMatchObject({ url: "/inicio" });
    expect(mocks.submit).toHaveBeenCalledOnce();
  });
});
