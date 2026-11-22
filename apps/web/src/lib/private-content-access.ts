import "server-only";
import { getTenantContext } from "./tenant-context";

type PrivateContentAccess = {
  userId: string;
  tenantId: string;
  role: "OWNER" | "STAFF";
};

/** OWNER and STAFF may read, create, update and delete private recipes and templates.
 *
 *  HU-025a2: wrapper de getTenantContext() (membresía leída por request, candado legacy y agenda principal).
 *  Conserva el retorno de HU-024 para sus ~25 consumidores; se elimina en 025b-2 cuando pasan a
 *  requireTenantContext. Soporte (025d): "STAFF" solo si el modo lo permite. */
export async function resolvePrivateContentAccess(
  mode: "read" | "write" = "write",
): Promise<PrivateContentAccess | null> {
  const ctx = await getTenantContext();
  if (!ctx) return null;
  const { userId, tenantId, access } = ctx;
  if (access.kind === "member") return { userId, tenantId, role: access.role };
  if (mode === "write" && access.mode === "READ_ONLY") return null;
  return { userId, tenantId, role: "STAFF" };
}
