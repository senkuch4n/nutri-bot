import { signIn } from "@/auth";
import { GoogleG, Wordmark } from "@/components/brand";
import { Button } from "@/components/ui";

/**
 * Pantalla de login sobria, compartida por /login e /inicio (D10). Es pública: no muestra el
 * nombre de la profesional para no depender de la base.
 */
export function LoginScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        <div className="rounded-lg border bg-card p-8">
          <h1 className="text-balance text-xl font-semibold">Ingresá al panel</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Usá tu cuenta de Google autorizada para continuar.
          </p>
          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <Button type="submit" variant="secondary" size="lg" className="w-full">
              <GoogleG />
              Entrar con Google
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Si no podés entrar, pedí que sumen tu correo a la lista de acceso.
        </p>
      </div>
    </main>
  );
}
