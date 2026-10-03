/**
 * Decide si el refresh_token de Google de quien acaba de iniciar sesión se guarda como el
 * token del calendario de la profesional. Al panel entran varias cuentas (`ALLOWED_EMAILS`),
 * pero el calendario es uno solo: sin este filtro, cualquier login pisaba el token y la
 * sincronización pasaba a la cuenta de esa persona.
 *
 * - Con `GOOGLE_CALENDAR_OWNER_EMAIL` configurado: solo se guarda el de esa cuenta.
 * - Sin configurar: solo si todavía no hay token o la sincronización está fallando (para que la
 *   primera conexión y la reconexión sigan andando), nunca para pisar uno que funciona.
 */
export function shouldStoreCalendarToken(input: {
  email: string | null | undefined;
  ownerEmail: string | null | undefined;
  hasToken: boolean;
  hasSyncError: boolean;
}): boolean {
  const email = input.email?.trim().toLowerCase();
  if (!email) return false;
  const owner = input.ownerEmail?.trim().toLowerCase();
  if (owner) return email === owner;
  return !input.hasToken || input.hasSyncError;
}
