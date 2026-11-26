import type { OnboardingSignupFormState } from "@/app/inicio/actions";
import { AuthCard } from "@/components/login-screen";
import { OnboardingSignupFormFields, type OnboardingSignupFormAction } from "@/components/onboarding-signup-form-fields";

export function OnboardingSignupForm({
  action,
  initialState = null,
}: {
  action: OnboardingSignupFormAction;
  initialState?: OnboardingSignupFormState | null;
}) {
  const timeZones = Intl.supportedValuesOf("timeZone");

  return (
    <AuthCard>
      <h1 className="text-balance text-title-2">Configurá tu consultorio</h1>
      <OnboardingSignupFormFields action={action} timeZones={timeZones} initialState={initialState} />
    </AuthCard>
  );
}
