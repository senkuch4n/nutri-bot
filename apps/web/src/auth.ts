import NextAuth from "next-auth";
import type { Account } from "next-auth";
import { canonicalEmail, decideTenantAccess } from "@nutri-bot/core";
import { prisma } from "@nutri-bot/db";
import { LEGACY_TENANT_ID, loadAccessFacts, registerGoogleIdentity } from "@nutri-bot/db/domain";
import { resolveLegacyCalendarScope } from "@nutri-bot/db/domain/legacySchedulingScope";
import { authConfig } from "./auth.config";
import { shouldStoreCalendarToken } from "./lib/calendar-token-owner";

type GoogleProfile = { sub?: unknown; email?: unknown; email_verified?: unknown } | undefined;

/** Identidad de Google verificada: proveedor google, email verificado, sub = providerAccountId y email no vacío. */
function verifiedGoogleIdentity(account: Account, profile: GoogleProfile) {
  const subject = profile?.sub;
  const email = profile?.email;
  if (
    account.provider !== "google" ||
    profile?.email_verified !== true ||
    typeof subject !== "string" || subject.length === 0 ||
    subject !== account.providerAccountId ||
    typeof email !== "string" || canonicalEmail(email).length === 0
  ) {
    return null;
  }
  return { subject, email: canonicalEmail(email) };
}

/** D10: el refresh_token del calendario solo se guarda para quien es miembro del consultorio original
 *  (y, además, la dueña del calendario según `shouldStoreCalendarToken`). Hasta HU-028 escribe la agenda legacy. */
async function maybeStoreCalendarToken(userId: string, email: string, refreshToken: string) {
  const decision = decideTenantAccess(await loadAccessFacts(userId, new Date()));
  if (!decision.ok || decision.grant.kind !== "member" || decision.grant.tenantId !== LEGACY_TENANT_ID) return;

  const verified = await resolveLegacyCalendarScope(prisma).catch((error: unknown) => {
    // El resolvedor no expone un error tipado para una agenda ausente.
    if (error instanceof Error && error.message === "No se pudo verificar la agenda de la instalación original.") {
      return null;
    }
    throw error;
  });
  if (!verified) return;
  const { scope, agendaOwner, professional } = verified;
  const store = shouldStoreCalendarToken({
    email,
    ownerEmail: process.env.GOOGLE_CALENDAR_OWNER_EMAIL,
    hasToken: !!professional.googleRefreshToken,
    hasSyncError: !!professional.googleSyncError,
  });
  if (!store) return;
  await prisma.professional.updateMany({
    where: {
      id: agendaOwner.professionalId,
      tenantId: scope.tenantId,
      agendas: { some: { id: scope.agendaId, tenantId: scope.tenantId, isPrimary: true } },
    },
    data: { googleRefreshToken: refreshToken, googleSyncError: null },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile, trigger }) {
      // session.update() supplies client data, not an authenticated OAuth identity.
      if (trigger === "update") return token;
      if (!account) return token;

      // Login: el JWT solo guarda el User registrado por la identidad verificada; rol y tenant se leen por request.
      delete token.userId;
      delete token.privateContentUserId; // claim de HU-024, reemplazado por userId
      const identity = verifiedGoogleIdentity(account, profile as GoogleProfile);
      if (!identity) return token;

      const registration = await registerGoogleIdentity(identity);
      if (registration.status !== "linked") {
        console.warn("[auth] identity_conflict");
        return token;
      }
      token.userId = registration.userId;

      if (account.refresh_token) {
        await maybeStoreCalendarToken(registration.userId, identity.email, account.refresh_token);
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.userId === "string" && token.userId) {
        session.userId = token.userId;
      }
      return session;
    },
  },
});
