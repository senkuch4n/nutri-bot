// HU-025 (9.4 y M12 de la SDD): una server action sin contexto de consultorio (membresía revocada a mitad
// de sesión) devuelve el error genérico de siempre con `reauth: true`, y la UI manda a /inicio
// (useActionToast lo hace solo). Puro: lo usan acciones (servidor) y tests sin mocks de tenant-context.

/** ¿El error es un TenantAccessError de lib/tenant-context (no_context, read_only, owner_only…)? Por nombre,
 *  para no importar el módulo server-only desde acá. */
export function isTenantAccessError(error: unknown): boolean {
  return error instanceof Error && error.name === "TenantAccessError";
}

/** `{ ...state, reauth: true }` si el error es de acceso; si no, el estado tal cual. */
export function withReauth<S extends object>(error: unknown, state: S): S & { reauth?: true } {
  return isTenantAccessError(error) ? { ...state, reauth: true } : state;
}
