import type { OnboardingSignupFormState } from "@/app/inicio/actions";
import { AccountSwitchActions, SignedInAccountNotice } from "@/components/account-switch-actions";
import { AuthCard } from "@/components/login-screen";
import { OnboardingSignupFormFields, type OnboardingSignupFormAction } from "@/components/onboarding-signup-form-fields";

export function OnboardingSignupForm({
  action,
  initialState = null,
  savedClinic,
  email,
}: {
  action: OnboardingSignupFormAction;
  initialState?: OnboardingSignupFormState | null;
  savedClinic?: { name: string; timeZone: string };
  email?: string | null;
}) {
  const timeZones = savedClinic ? [] : Intl.supportedValuesOf("timeZone");

  return (
    <AuthCard>
      <h1 className="text-balance text-title-2">Configurá tu consultorio</h1>
      <SignedInAccountNotice email={email} />
      {!savedClinic ? (
        <p className="mt-2 text-footnote text-muted-foreground">
          Si te invitaron a un consultorio existente, verificá tu cuenta o cambiá de cuenta antes de crear uno nuevo.
        </p>
      ) : null}
      <OnboardingSignupFormFields action={action} timeZones={timeZones} initialState={initialState} savedClinic={savedClinic} />
      <AccountSwitchActions className="mt-4 flex flex-col gap-2" />
    </AuthCard>
  );
}
