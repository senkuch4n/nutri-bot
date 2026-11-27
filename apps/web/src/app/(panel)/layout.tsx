import { PanelShell } from "@/components/shell/panel-shell";
import { requirePageContext } from "@/lib/tenant-context";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // HU-025: sin contexto de consultorio (sin sesión, sin membresía, revocada) → /inicio.
  const ctx = await requirePageContext();
  return <PanelShell tenantId={ctx.tenantId}>{children}</PanelShell>;
}
