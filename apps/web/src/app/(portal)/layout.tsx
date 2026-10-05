import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmProvider } from "@/components/confirm";
import { PortalAccessGate, PortalAccessScreen } from "@/components/portal/portal-access";
import { Toaster } from "@/components/primitives/sonner";
import { PortalHeader } from "@/components/shell/portal-header";
import { PortalNav } from "@/components/shell/portal-nav";
import { getPortalPatient } from "@/lib/patient-session";
import { getPortalDocumentTitle, getProfessionalPortalContact } from "@/lib/shell";

// HU-017d-1: la pestaña del portal no dice "NutriBot — Panel" (el título del layout raíz).
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: await getPortalDocumentTitle(),
    description: "Tu plan, tu evolución y tu diario, con tu nutricionista.",
  };
}

// HU-017a §10.3. `theme-portal` = fondo agrupado cálido (D2); el resto de la paleta es la del panel.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [patient, contact] = await Promise.all([getPortalPatient(), getProfessionalPortalContact()]);

  if (!patient) {
    // HU-017d-1 (Q2): el layout no recibe searchParams; el gate cliente distingue "link vencido"
    // (?error=invalid) de "sin link". El Suspense evita el aviso de useSearchParams en el build.
    return (
      <Suspense
        fallback={
          <PortalAccessScreen variant="no-link" professionalName={contact.name} whatsappUrl={contact.whatsappUrl} />
        }
      >
        <PortalAccessGate professionalName={contact.name} whatsappUrl={contact.whatsappUrl} />
      </Suspense>
    );
  }

  return (
    <ConfirmProvider>
      <div className="theme-portal relative min-h-[100dvh] bg-grouped text-foreground">
        <PortalHeader professionalName={contact.name} />
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
    </ConfirmProvider>
  );
}
