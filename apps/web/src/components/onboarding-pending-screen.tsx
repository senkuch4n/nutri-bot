import { AccountSwitchActions, SignedInAccountNotice } from "@/components/account-switch-actions";
import { AuthCard } from "@/components/login-screen";
import { ARZIUM_CONTACT_EMAIL } from "@/components/public-page";
import { ButtonLink } from "@/components/ui";

// Render only after the server resolves the pending owner's clinic.
export function OnboardingPendingScreen({
  clinicName,
  email,
}: {
  clinicName: string;
  email?: string | null;
}) {
  return (
    <AuthCard>
      <p className="text-footnote text-muted-foreground">Alta del consultorio</p>
      <h1 className="mt-1 break-words text-balance text-title-2">{clinicName}</h1>
      <SignedInAccountNotice email={email} />
      <ol aria-label="Progreso del alta" className="mt-4 list-decimal space-y-2 pl-5 text-body">
        <li>Configuración guardada</li>
        <li aria-current="step" className="font-semibold">Suscripción pendiente</li>
      </ol>
      <p className="mt-4 text-body text-muted-foreground">
        Todavía no podés operar el consultorio. Cuando se confirme la suscripción, vas a poder entrar al panel.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <ButtonLink href="/ajustes/suscripcion" size="lg" className="w-full" prefetch={false}>
          Ir a la suscripción
        </ButtonLink>
        <a href={`mailto:${ARZIUM_CONTACT_EMAIL}`} className="text-center text-footnote underline underline-offset-4">
          Contactar a Arzium
        </a>
      </div>
      <AccountSwitchActions retryHref="/inicio" className="mt-4 flex flex-col gap-2" />
    </AuthCard>
  );
}
