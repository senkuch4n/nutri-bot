import { Wordmark } from "@/components/brand";
import { getPortalPatient } from "@/lib/patient-session";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const patient = await getPortalPatient();

  if (!patient) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="max-w-sm space-y-4 text-center">
          <Wordmark className="justify-center" />
          <h1 className="font-display text-xl font-bold text-ink">Portal del paciente</h1>
          <p className="text-sm leading-relaxed text-ink-soft">
            Para entrar necesitás un link de acceso. Escribile a tu nutricionista por WhatsApp
            <strong> &quot;portal&quot; </strong> o elegí la opción del menú y te lo mandamos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <Wordmark />
          <nav className="flex items-center gap-4 text-sm">
            <a href="/portal" className="text-ink-soft transition-colors hover:text-ink">
              Inicio
            </a>
            <a href="/portal/evolucion" className="text-ink-soft transition-colors hover:text-ink">
              Evolución
            </a>
            <a href="/portal/diario" className="text-ink-soft transition-colors hover:text-ink">
              Diario
            </a>
            <form action="/portal/logout" method="POST">
              <button className="text-ink-faint transition-colors hover:text-ink">Salir</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
