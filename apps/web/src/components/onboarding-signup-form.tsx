import type { OnboardingSignupFormState } from "@/app/inicio/actions";
import { AuthCard } from "@/components/login-screen";
import { OnboardingSignupFormFields, type OnboardingSignupFormAction } from "@/components/onboarding-signup-form-fields";

export function OnboardingSignupForm({
  action,
  initialState = null,
  savedClinic,
}: {
  action: OnboardingSignupFormAction;
  initialState?: OnboardingSignupFormState | null;
  savedClinic?: { name: string; timeZone: string };
}) {
  const timeZones = savedClinic ? [] : Intl.supportedValuesOf("timeZone");

  return (
    <AuthCard>
      <h1 className="text-balance text-title-2">Configurá tu consultorio</h1>
      <OnboardingSignupFormFields action={action} timeZones={timeZones} initialState={initialState} savedClinic={savedClinic} />
    </AuthCard>
  );
}
