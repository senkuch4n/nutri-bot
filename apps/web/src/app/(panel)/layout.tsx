import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ConfirmProvider } from "@/components/confirm";
import { PendingUnloadGuard } from "@/components/pending-unload-guard";
import { Toaster } from "@/components/primitives/sonner";
import { TooltipProvider } from "@/components/primitives/tooltip";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileTopbar } from "@/components/shell/mobile-topbar";
import { SIDEBAR_COOKIE } from "@/components/shell/nav-config";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { getBotShellStatus, getPendingInquiryCount, getProfessionalDisplayName } from "@/lib/shell";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/inicio");

  // El estado del bot se calcula en cada render del layout: en navegación cliente puede quedar
  // desactualizado hasta recargar (aceptado, ver SDD O3).
  const [professionalName, botStatus, pendingInquiries, cookieStore] = await Promise.all([
    getProfessionalDisplayName(),
    getBotShellStatus(),
    getPendingInquiryCount(),
    cookies(),
  ]);
  const badges = { pendingInquiries };
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";
  const email = session.user.email;
  const account = <SignOutButton />;

  return (
    <TooltipProvider delayDuration={300}>
      <ConfirmProvider>
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-3 focus:py-2 focus:text-callout focus:shadow-float"
        >
          Saltar al contenido
        </a>
        <AppSidebar
          initialCollapsed={collapsed}
          professionalName={professionalName}
          email={email}
          botStatus={botStatus}
          account={account}
          badges={badges}
        >
          <MobileTopbar
            professionalName={professionalName}
            email={email}
            botStatus={botStatus}
            account={account}
            badges={badges}
          />
          <main
            id="contenido"
            tabIndex={-1}
            className="mx-auto w-full max-w-screen-2xl px-6 py-8 focus-visible:outline-none lg:px-10"
          >
            {children}
          </main>
        </AppSidebar>
        <Toaster position="bottom-right" />
        <PendingUnloadGuard />
      </ConfirmProvider>
    </TooltipProvider>
  );
}
