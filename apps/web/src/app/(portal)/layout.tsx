import { Wordmark } from "@/components/brand";
import { Toaster } from "@/components/primitives/sonner";
import { PortalHeader } from "@/components/shell/portal-header";
import { PortalNav } from "@/components/shell/portal-nav";
import { getPortalPatient } from "@/lib/patient-session";
import { getProfessionalPortalName } from "@/lib/shell";

// HU-017a §10.3. `theme-portal` = fondo agrupado cálido (D2). `theme-warm` (paleta Notion del portal)
// convive hasta el "flip" de la fase 7, que la retira.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [patient, professionalName] = await Promise.all([
    getPortalPatient(),
    getProfessionalPortalName(),
  ]);

  if (!patient) {
    return (
      <div className="theme-warm theme-portal grid min-h-[100dvh] place-items-center bg-grouped px-4 text-foreground">
        <div className="w-full max-w-sm rounded-xl bg-card p-8 text-center shadow-card more-contrast:border more-contrast:border-input">
          <Wordmark subtitle={professionalName} className="mb-6 justify-center" />
          <h1 className="text-balance text-title-2">Portal del paciente</h1>
          <p className="mt-3 text-pretty text-callout text-muted-foreground">
            Para entrar necesitás un link de acceso. Escribile a tu nutricionista por WhatsApp
            <strong className="font-semibold text-foreground"> &quot;portal&quot; </strong> o elegí la
            opción del menú y te lo mandamos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-warm theme-portal relative min-h-[100dvh] bg-grouped text-foreground">
      <PortalHeader professionalName={professionalName} />
      {/* El contenido pasa por debajo del header y de la tab bar (materiales translúcidos). */}
      <main
        data-portal-main
        className="mx-auto max-w-2xl px-4 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1.5rem)] pt-6 md:py-8"
      >
        {children}
      </main>
      <PortalNav variant="bottom" />
      <Toaster
        position="top-center"
        offset={{ top: "calc(env(safe-area-inset-top) + 4rem)" }}
        mobileOffset={{ top: "calc(env(safe-area-inset-top) + 4rem)" }}
      />
    </div>
  );
}
