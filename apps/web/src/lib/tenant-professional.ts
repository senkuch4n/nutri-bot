// HU-025: clave compuesta de la profesional de la agenda principal del contexto (para update/findUnique
// de Professional). Pura: el contexto ya trae professionalId resuelto en el servidor, nunca del cliente.
export function tenantProfessionalWhere(ctx: { tenantId: string; professionalId: number }) {
  return { id_tenantId: { id: ctx.professionalId, tenantId: ctx.tenantId } };
}
