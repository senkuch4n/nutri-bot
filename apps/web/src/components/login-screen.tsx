import { signIn } from "@/auth";
import { GoogleG, Wordmark } from "@/components/brand";
import { SubmitButton } from "@/components/submit-button";

/**
 * Pantalla de login sobria, compartida por /login e /inicio (D10). Es pública: no muestra el
 * nombre de la profesional para no depender de la base.
 */
export function LoginScreen() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-grouped px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        {/* Entrada sobria (§16 Delight sin espectáculo): sube 8 px con fundido; solo fundido con movimiento reducido. */}
        <div className="rounded-xl bg-card p-8 shadow-card motion-safe:animate-rise-in motion-reduce:animate-fade-in-content more-contrast:border more-contrast:border-input">
          <h1 className="text-balance text-title-1">Ingresá al panel</h1>
          <p className="mt-2 text-body text-muted-foreground">
            Usá tu cuenta de Google autorizada para continuar.
          </p>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            {/* Spinner apenas se envía (§1): Google tarda en responder. */}
            <SubmitButton variant="secondary" size="lg" className="mt-6 w-full" pendingLabel="Abriendo Google…">
              <GoogleG />
              Entrar con Google
            </SubmitButton>
          </form>
        </div>
        <p className="mt-6 text-center text-footnote text-muted-foreground">
          Si no podés entrar, pedí que sumen tu correo a la lista de acceso.
        </p>
      </div>
    </main>
  );
}
