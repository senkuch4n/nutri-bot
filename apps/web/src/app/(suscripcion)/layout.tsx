import { ConfirmProvider } from "@/components/confirm";
import { Wordmark } from "@/components/brand";
import { Toaster } from "@/components/primitives/sonner";
import { PanelShell } from "@/components/shell/panel-shell";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { getTenantAccess, requireSubscriptionPageContext } from "@/lib/tenant-context";

/**
 * HU-029b (§B.6.7 punto 4): layout de /ajustes/suscripcion. Operativa → el mismo shell del panel. OWNER en
 * onboarding (HU-026: alta completa, suscripción pendiente) → layout mínimo, sin sidebar ni datos del bot:
 * del panel solo puede usar esta pantalla.
 */
export default async function SubscriptionLayout({ children }: { children: React.ReactNode }) {
  const sctx = await requireSubscriptionPageContext();
  if (!sctx.onboarding) return <PanelShell tenantId={sctx.tenantId}>{children}</PanelShell>;

  const access = await getTenantAccess(); // cacheado por request
  const clinicName = !access.ok && access.reason === "onboarding_pending" ? access.clinicName : null;
  return (
    <ConfirmProvider>
      <div className="min-h-[100dvh] bg-grouped">
        <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 pt-6">
          <div className="min-w-0">
            <Wordmark />
            {clinicName ? <p className="mt-1 truncate text-footnote text-muted-foreground">{clinicName}</p> : null}
          </div>
          <SignOutButton />
        </header>
        <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-3xl px-6 py-8 focus-visible:outline-none">
          {children}
        </main>
      </div>
      <Toaster position="bottom-right" />
    </ConfirmProvider>
  );
}
