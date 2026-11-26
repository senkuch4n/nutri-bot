"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOnboardingServer, isPublicOnboardingEnabled } from "@/lib/onboarding-server";
import { getTenantSubscriptionGate } from "@/lib/onboarding-subscription-gate";
import { ENABLED_TENANT_IDS } from "@/lib/tenant-context";

export type OnboardingSignupFormState = {
  error?: string;
  values?: {
    name: string;
    professionalName: string;
    timeZone: string;
  };
};

function readField(formData: FormData, key: "name" | "professionalName" | "timeZone"): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function mapSignupError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "Required setup field: name") return "Ingresá el nombre del consultorio.";
  if (message === "Required setup field: professionalName") return "Ingresá el nombre profesional que querés mostrar.";
  if (message === "Required setup field: timeZone" || message.toLowerCase().includes("time zone")) {
    return "Elegí una zona horaria válida.";
  }
  if (message === "Verified identity is required") return "Tu sesión venció. Volvé a iniciar sesión con Google.";
  return "No pudimos guardar la configuración. Intentá de nuevo en unos momentos.";
}

export async function submitOnboardingClinicAction(
  _prev: OnboardingSignupFormState | null,
  formData: FormData,
): Promise<OnboardingSignupFormState> {
  const values = {
    name: readField(formData, "name"),
    professionalName: readField(formData, "professionalName"),
    timeZone: readField(formData, "timeZone"),
  };

  const server = createOnboardingServer({
    existingEnabledTenantIds: ENABLED_TENANT_IDS,
    getTenantSubscriptionGate,
    onComplete: () => {
      revalidatePath("/inicio");
      revalidatePath("/");
    },
  });

  if (!isPublicOnboardingEnabled()) {
    const current = await server.resolve();
    if (current.kind !== "setup") {
      return { error: "El alta de nuevos consultorios no está habilitada todavía.", values };
    }
  }

  let target: "/" | "/inicio";
  try {
    await server.submit(formData);
    const next = await server.resolve();
    target = next.kind === "operational" ? "/" : "/inicio";
  } catch (error) {
    return { error: mapSignupError(error), values };
  }

  redirect(target);
}
