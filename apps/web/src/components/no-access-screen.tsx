import { ACCESS_TEXT, noAccessCopy, type AccessDenial } from "@nutri-bot/core";
import { signIn, signOut } from "@/auth";
import { GoogleG } from "@/components/brand";
import { AuthCard } from "@/components/login-screen";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink } from "@/components/ui";

/**
 * HU-025 (9.1): sesión de Google sin acceso a un consultorio. Explica por qué, con qué cuenta entró y
 * qué hacer, sin nombrar otros consultorios ni decir si la cuenta existe en otro. "Usar otra cuenta"
 * cierra la sesión y abre el selector de cuentas de Google; "Reintentar" vuelve al panel, por si ya le
 * dieron acceso (la membresía se lee en cada request, no hace falta volver a entrar).
 */
export function NoAccessScreen({ reason, email }: { reason: AccessDenial; email: string | null }) {
  const copy = noAccessCopy(reason);
  return (
    <AuthCard>
      <h1 className="text-balance text-title-2">{copy.title}</h1>
      {email ? (
        <p className="mt-3 text-body text-muted-foreground">
          {ACCESS_TEXT.signedInAs} <strong className="break-all font-semibold text-foreground">{email}</strong>.
        </p>
      ) : null}
      <p className="mt-2 text-body text-muted-foreground">{copy.body}</p>
      {copy.pendingNote ? <p className="mt-2 text-body text-muted-foreground">{copy.pendingNote}</p> : null}
      <div className="mt-6 flex flex-col gap-2">
        <form
          action={async () => {
            "use server";
            await signOut({ redirect: false });
            // Solo este botón pide elegir cuenta; el login normal no cambia (R15).
            await signIn("google", { redirectTo: "/" }, { prompt: "select_account consent" });
          }}
        >
          <SubmitButton variant="secondary" size="lg" className="w-full" pendingLabel={ACCESS_TEXT.useOtherAccountPending}>
            <GoogleG />
            {ACCESS_TEXT.useOtherAccount}
          </SubmitButton>
        </form>
        <ButtonLink href="/" variant="plain" size="lg" className="w-full" prefetch={false}>
          {ACCESS_TEXT.retry}
        </ButtonLink>
      </div>
    </AuthCard>
  );
}
