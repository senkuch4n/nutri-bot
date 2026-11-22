import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { NoAccessScreen } from "@/components/no-access-screen";
import { getTenantAccess } from "@/lib/tenant-context";

/**
 * HU-025 (6.1 paso 5, 8.1): los tres estados de /inicio y /login.
 * - Con acceso a un consultorio → al panel.
 * - Con sesión de Google y sin acceso → aviso con la razón y el email de la sesión.
 * - Sin sesión → login.
 */
export async function AccessGateScreen() {
  const access = await getTenantAccess();
  if (access.ok) redirect("/");
  if (access.reason === "unauthenticated") return <LoginScreen />;
  return <NoAccessScreen reason={access.reason} email={access.email} />;
}
