import { redirect } from "next/navigation";
import { submitOnboardingClinicAction } from "@/app/inicio/actions";
import { LoginScreen } from "@/components/login-screen";
import { NoAccessScreen } from "@/components/no-access-screen";
import { OnboardingPendingScreen } from "@/components/onboarding-pending-screen";
import { OnboardingSignupForm } from "@/components/onboarding-signup-form";
import { isPublicOnboardingEnabled } from "@/lib/onboarding-server";
import { getTenantAccess } from "@/lib/tenant-context";

/**
 * HU-025 (6.1 paso 5, 8.1) + HU-026: estados de /inicio y /login.
 * - Con acceso operativo a un consultorio → al panel.
 * - Sin sesión → login.
 * - Titular con suscripción pendiente → pantalla de espera.
 * - Titular con alta incompleta (o nueva titular cuando el alta pública esté habilitada) → formulario de alta.
 * - Sesión sin acceso → aviso con la razón y el email de la sesión.
 */
export async function AccessGateScreen({ signInError }: { signInError?: string | string[] } = {}) {
  const access = await getTenantAccess();
  if (access.ok) redirect("/");
  // Auth.js manda a /inicio?error=AccessDenied (u otro código) si rechazó el login: aviso genérico.
  if (access.reason === "unauthenticated") return <LoginScreen signInFailed={Boolean(signInError)} />;
  if (access.reason === "onboarding_pending") return <OnboardingPendingScreen clinicName={access.clinicName} />;
  if (access.reason === "onboarding_setup") return <OnboardingSignupForm action={submitOnboardingClinicAction} />;
  if (access.reason === "no_membership" && isPublicOnboardingEnabled()) {
    return <OnboardingSignupForm action={submitOnboardingClinicAction} />;
  }
  return <NoAccessScreen reason={access.reason} email={access.email} />;
}
