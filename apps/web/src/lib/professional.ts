import "server-only";
// HU-025: el panel lee la profesional del consultorio del contexto (getTenantProfessional(ctx.tenantId));
// HU-033 (025c): el portal, la del consultorio de la sesión del portal.
export { getTenantProfessional } from "@nutri-bot/db/domain";
export type { TenantProfessional as Professional } from "@nutri-bot/db/domain";
