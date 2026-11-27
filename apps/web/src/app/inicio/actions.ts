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
  if (message === "Required setup field: name" || message === "Clinic name is required") {
    return "Ingresá el nombre del consultorio.";
  }
  if (message === "Required setup field: professionalName" || message === "Professional name is required") {
    return "Ingresá el nombre profesional que querés mostrar.";
  }
  if (message === "Required setup field: timeZone" || message.toLowerCase().includes("time zone")) {
    return "Elegí una zona horaria válida.";
  }
  if (message === "Verified identity is required" || message === "Verified Google identity is required") {
    return "Tu sesión venció. Volvé a iniciar sesión con Google.";
  }
  if (message === "Verified clinic owner is required") {
    return "Solo la titular verificada del consultorio puede completar esta configuración.";
  }
  if (message === "The identity already belongs to a clinic outside onboarding") {
    return "Esta cuenta de Google ya pertenece a un consultorio. Recargá la página o usá otra cuenta.";
  }
  if (message === "Clinic changed during signup") {
    return "El estado de tu consultorio cambió durante el alta. Recargá la página para continuar.";
  }
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

  let target: "/" | "/inicio";
  try {
    const current = await server.resolve();
    switch (current.kind) {
      case "operational":
        target = "/";
        break;
      case "onboarding":
        target = "/inicio";
        break;
      case "setup": {
        values.name = current.clinicName;
        values.timeZone = current.timeZone;
        await server.submit(formData, current.tenantId);
        const next = await server.resolve();
        target = next.kind === "operational" ? "/" : "/inicio";
        break;
      }
      case "denied": {
        if (current.reason === "unauthenticated" || current.reason === "unlinked") {
          return { error: "Tu sesión venció. Volvé a iniciar sesión con Google.", values };
        }
        if (current.reason !== "no_membership") {
          target = "/inicio";
          break;
        }
        if (!isPublicOnboardingEnabled()) {
          return { error: "El alta de nuevos consultorios no está habilitada todavía.", values };
        }
        await server.submit(formData);
        const next = await server.resolve();
        target = next.kind === "operational" ? "/" : "/inicio";
        break;
      }
    }
  } catch (error) {
    return { error: mapSignupError(error), values };
  }

  redirect(target);
}
