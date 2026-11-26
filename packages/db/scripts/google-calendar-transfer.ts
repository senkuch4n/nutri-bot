// HU-028b (D6a): traslado idempotente del refresh token de Google Calendar guardado en texto plano en
// Professional.googleRefreshToken (login viejo, HU-024) a GoogleCalendarAccount, cifrado con
// INTEGRATION_TOKEN_KEY y AAD por consultorio. La profesional NO tiene que reconectar.
//
//   tsx scripts/google-calendar-transfer.ts            # dry-run: solo cuenta, no escribe
//   tsx scripts/google-calendar-transfer.ts --apply    # escribe (corre en el servicio `migrate` del deploy)
//
// No modifica Professional (así un rollback de código no obliga a reconectar). Salida: una sola línea
// JSON con conteos; nunca tokens, emails, ids de usuario ni el error crudo. Se borra en 028b-2.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalEmail } from "@nutri-bot/core";
import { PrismaClient } from "@prisma/client";
import { GOOGLE_SECRET_AAD, IntegrationConfigError, loadIntegrationTokenKey, openSecret, sealSecret } from "../domain/secretBox";

export type GoogleCalendarTransferResult = { transferred: number; alreadyConnected: number; skipped: number };

type Candidate = {
  id: number;
  tenantId: string | null;
  googleRefreshToken: string;
  googleCalendarId: string | null;
  googleSyncError: string | null;
  isPrimary: boolean;
};

class TransferVerificationError extends Error {}

export async function transferLegacyGoogleCalendarTokens(
  db: PrismaClient,
  opts: { apply: boolean; env: Record<string, string | undefined>; now: Date },
): Promise<GoogleCalendarTransferResult> {
  // Antes de leer nada: sin clave válida no hay traslado posible.
  const key = loadIntegrationTokenKey(opts.env);
  const ownerEmailRaw = opts.env.GOOGLE_CALENDAR_OWNER_EMAIL?.trim();
  const ownerEmail = ownerEmailRaw ? canonicalEmail(ownerEmailRaw) : null;

  return db.$transaction(async (tx) => {
    if (opts.apply) await tx.$executeRaw`LOCK TABLE "GoogleCalendarAccount" IN SHARE ROW EXCLUSIVE MODE`;
    const rows = await tx.$queryRaw<Candidate[]>`
      SELECT p.id, p."tenantId", p."googleRefreshToken", p."googleCalendarId", p."googleSyncError",
        EXISTS (
          SELECT 1 FROM "Agenda" a
          WHERE a."professionalId" = p.id AND a."tenantId" = p."tenantId" AND a."isPrimary"
        ) AS "isPrimary"
      FROM "Professional" p
      WHERE p."googleRefreshToken" IS NOT NULL
      ORDER BY p.id`;

    const result: GoogleCalendarTransferResult = { transferred: 0, alreadyConnected: 0, skipped: 0 };
    for (const p of rows) {
      if (!p.tenantId || !p.isPrimary) {
        result.skipped++;
        continue;
      }
      const tenantId = p.tenantId;
      const existing = await tx.googleCalendarAccount.findUnique({
        where: { tenantId },
        select: { refreshTokenEnc: true, disconnectedAt: true },
      });
      // No se pisa una conexión hecha con el flujo nuevo ni se resucita una desconectada.
      if (existing && (existing.refreshTokenEnc !== null || existing.disconnectedAt !== null)) {
        result.alreadyConnected++;
        continue;
      }
      result.transferred++;
      if (!opts.apply) continue;

      let identity: { googleEmail: string | null; googleSubject: string | null } = { googleEmail: null, googleSubject: null };
      if (ownerEmail) {
        const users = await tx.user.findMany({
          where: { googleSubject: { not: null }, memberships: { some: { tenantId } } },
          select: { email: true, googleSubject: true },
        });
        const matches = users.filter((u) => canonicalEmail(u.email) === ownerEmail);
        if (matches.length === 1) identity = { googleEmail: ownerEmail, googleSubject: matches[0]!.googleSubject };
      }

      const syncError = p.googleSyncError;
      const data = {
        refreshTokenEnc: sealSecret(p.googleRefreshToken, key, GOOGLE_SECRET_AAD.refreshToken(tenantId)),
        calendarId: p.googleCalendarId,
        syncError,
        syncErrorAt: syncError ? opts.now : null,
        connectedAt: opts.now,
        scope: null,
        ...identity,
      };
      await tx.googleCalendarAccount.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
      const reread = await tx.googleCalendarAccount.findUnique({ where: { tenantId }, select: { refreshTokenEnc: true } });
      if (!reread?.refreshTokenEnc || openSecret(reread.refreshTokenEnc, key, GOOGLE_SECRET_AAD.refreshToken(tenantId)) !== p.googleRefreshToken) {
        throw new TransferVerificationError(); // rollback de todo
      }
    }
    return result;
  }, { timeout: 30_000, maxWait: 10_000 });
}

async function main(args: string[]): Promise<number> {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
    console.error("Usage: google-calendar-transfer [--apply]");
    return 2;
  }
  const apply = args[0] === "--apply";
  const datasourceUrl = process.env.DATABASE_URL;
  if (!datasourceUrl) {
    console.error("Set DATABASE_URL explicitly.");
    return 2;
  }
  try {
    loadIntegrationTokenKey(process.env);
  } catch {
    console.error("INTEGRATION_TOKEN_KEY inválida o ausente");
    return 2;
  }
  const db = new PrismaClient({ datasourceUrl });
  try {
    const r = await transferLegacyGoogleCalendarTokens(db, { apply, env: process.env, now: new Date() });
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", transferred: r.transferred, alreadyConnected: r.alreadyConnected, skipped: r.skipped }));
    return 0;
  } catch (error) {
    console.error(error instanceof IntegrationConfigError ? "INTEGRATION_TOKEN_KEY inválida o ausente" : "Google Calendar transfer failed.");
    return error instanceof IntegrationConfigError ? 2 : 1;
  } finally {
    await db.$disconnect();
  }
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1]!)).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
