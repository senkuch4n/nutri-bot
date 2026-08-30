import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { CornerTriangle, Eyebrow, GoogleG, SpringShapes, Wordmark } from "@/components/brand";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.15fr_0.85fr]">
      {/* Panel de marca */}
      <section className="relative hidden overflow-hidden bg-mint px-12 py-12 lg:flex lg:flex-col">
        <SpringShapes />
        <div className="relative z-10 flex h-full flex-col">
          <Wordmark />

          <div className="my-auto max-w-xl">
            <Eyebrow>Panel de la profesional</Eyebrow>
            <h1 className="font-display mt-6 text-[3.5rem] font-bold leading-[0.98] text-ink xl:text-6xl">
              Tu agenda,
              <br />
              en piloto
              <br />
              automático.
            </h1>
            <p className="mt-7 max-w-md text-lg leading-relaxed text-ink-soft">
              Turnos, servicios y recordatorios en un solo lugar. El bot atiende WhatsApp;
              vos ves y decidís todo desde acá.
            </p>
            <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-2 text-sm font-medium text-ink">
              <li>Calendario de turnos</li>
              <li aria-hidden className="text-leaf">·</li>
              <li>Precios y servicios</li>
              <li aria-hidden className="text-leaf">·</li>
              <li>Recordatorios automáticos</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Acceso */}
      <section className="relative flex items-center justify-center overflow-hidden bg-paper px-6 py-16">
        <CornerTriangle />

        <div className="relative z-10 w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Wordmark />
          </div>

          <div className="border border-line bg-white p-8 shadow-card sm:p-10">
            <Eyebrow>Acceso</Eyebrow>
            <h2 className="font-display mt-3 text-[2rem] font-bold leading-tight text-ink">
              Ingresá al panel
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Usá tu cuenta de Google autorizada para continuar.
            </p>

            <form
              className="mt-8"
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <button className="group flex w-full items-center justify-center gap-3 border-2 border-ink bg-white px-6 py-4 text-sm font-semibold uppercase tracking-[0.08em] text-ink transition-colors duration-150 hover:border-leaf hover:bg-leaf-tint">
                <GoogleG />
                Entrar con Google
              </button>
            </form>

            <div className="mt-6 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              <span className="h-px flex-1 bg-line" />
              solo cuentas autorizadas
              <span className="h-px flex-1 bg-line" />
            </div>
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
            Si no podés entrar, pedí que sumen tu correo a la lista de acceso.
          </p>
        </div>

        <p className="absolute inset-x-0 bottom-6 text-center text-xs text-ink-faint">
          NutriBot · gestión de turnos
        </p>
      </section>
    </main>
  );
}
