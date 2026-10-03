import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Toaster } from "@/components/primitives/sonner";
import { PortalNav } from "@/components/shell/portal-nav";
import { Button } from "@/components/ui";
import { getPortalPatient } from "@/lib/patient-session";
import { getProfessionalPortalName } from "@/lib/shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [patient, professionalName] = await Promise.all([
    getPortalPatient(),
    getProfessionalPortalName(),
  ]);

  if (!patient) {
    return (
      <div className="theme-warm flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-sm rounded-lg border bg-card p-8 text-center">
          <Wordmark subtitle={professionalName} className="mb-6 justify-center" />
          <h1 className="text-balance text-xl font-semibold">Portal del paciente</h1>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
            Para entrar necesitás un link de acceso. Escribile a tu nutricionista por WhatsApp
            <strong className="font-semibold text-foreground"> &quot;portal&quot; </strong> o elegí la
            opción del menú y te lo mandamos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-warm min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-4 px-4">
          <Wordmark subtitle={professionalName} />
          <div className="flex items-center gap-2">
            <PortalNav variant="top" className="hidden md:flex" />
            <form action="/portal/logout" method="POST">
              <Button type="submit" variant="ghost" size="lg" className="text-muted-foreground">
                <LogOut aria-hidden />
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-6 md:py-8">{children}</main>
      <PortalNav variant="bottom" />
      <Toaster position="top-center" />
    </div>
  );
}
