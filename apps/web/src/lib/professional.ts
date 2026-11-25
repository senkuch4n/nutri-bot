import "server-only";
// HU-025: el panel lee la profesional del consultorio del contexto (getTenantProfessional(ctx.tenantId)).
// getProfessional (Professional(1)) queda solo para el portal hasta 025c.
export { getProfessional, getTenantProfessional } from "@nutri-bot/db/domain";
export type { TenantProfessional as Professional } from "@nutri-bot/db/domain";
