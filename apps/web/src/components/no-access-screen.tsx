import { noAccessCopy, type AccessDenial } from "@nutri-bot/core";
import { AccountSwitchActions, SignedInAccountNotice } from "@/components/account-switch-actions";
import { AuthCard } from "@/components/login-screen";

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
      <SignedInAccountNotice email={email} />
      <p className="mt-2 text-body text-muted-foreground">{copy.body}</p>
      {copy.pendingNote ? <p className="mt-2 text-body text-muted-foreground">{copy.pendingNote}</p> : null}
      <AccountSwitchActions />
    </AuthCard>
  );
}
