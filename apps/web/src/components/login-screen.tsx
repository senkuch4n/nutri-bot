import type { ReactNode } from "react";
import { ACCESS_TEXT } from "@nutri-bot/core";
import { Alert } from "@/components/ui";
import { signIn } from "@/auth";
import { GoogleG, Wordmark } from "@/components/brand";
import { PublicFooterLinks } from "@/components/public-page";
import { SubmitButton } from "@/components/submit-button";

/**
 * Cáscara de las pantallas de acceso (/inicio, /login): marca arriba, tarjeta centrada, nota y
 * links públicos abajo. La comparten `LoginScreen` y `NoAccessScreen` (HU-025, 9.1).
 */
export function AuthCard({ children, footnote }: { children: ReactNode; footnote?: ReactNode }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-grouped px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        {/* Entrada sobria (§16 Delight sin espectáculo): sube 8 px con fundido; solo fundido con movimiento reducido. */}
        <div className="rounded-xl bg-card p-8 shadow-card motion-safe:animate-rise-in motion-reduce:animate-fade-in-content more-contrast:border more-contrast:border-input">
          {children}
        </div>
        {footnote ? <p className="mt-6 text-center text-footnote text-muted-foreground">{footnote}</p> : null}
        <PublicFooterLinks className={footnote ? "mt-4" : "mt-6"} />
      </div>
    </main>
  );
}

/**
 * Pantalla de login sobria, compartida por /login e /inicio (D10). Es pública: no muestra el
 * nombre de la profesional para no depender de la base.
 */
export function LoginScreen({ signInFailed = false }: { signInFailed?: boolean } = {}) {
  return (
    <AuthCard footnote={ACCESS_TEXT.loginFootnote}>
      <h1 className="text-balance text-title-1">{ACCESS_TEXT.loginTitle}</h1>
      <p className="mt-2 text-body text-muted-foreground">{ACCESS_TEXT.loginSubtitle}</p>
      {/* HU-025 (6.1 paso 1): aviso genérico, sin decir por qué se rechazó ni si la cuenta existe. */}
      {signInFailed ? (
        <div className="mt-4">
          <Alert tone="warning">{ACCESS_TEXT.signInFailed}</Alert>
        </div>
      ) : null}
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        {/* Spinner apenas se envía (§1): Google tarda en responder. */}
        <SubmitButton variant="secondary" size="lg" className="mt-6 w-full" pendingLabel={ACCESS_TEXT.loginPending}>
          <GoogleG />
          {ACCESS_TEXT.loginButton}
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
