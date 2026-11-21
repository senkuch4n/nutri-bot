import NextAuth from "next-auth";
import { prisma } from "@nutri-bot/db";
import { resolveLegacyCalendarScope } from "@nutri-bot/db/domain/legacySchedulingScope";
import { authConfig } from "./auth.config";
import { shouldStoreCalendarToken } from "./lib/calendar-token-owner";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile, trigger }) {
      // session.update() supplies client data, not an authenticated OAuth identity.
      if (trigger === "update") return token;
      // En el login con Google guardamos el refresh_token en la ficha de la profesional para
      // que el bot pueda sincronizar el calendario, pero solo el de la dueña del calendario
      // (ver `shouldStoreCalendarToken`): otro login no puede pisarlo.
      if (account?.provider === "google" && account.refresh_token) {
        const verified = await resolveLegacyCalendarScope(prisma).catch((error: unknown) => {
          // El resolvedor no expone un error tipado para una agenda ausente.
          if (error instanceof Error && error.message === "No se pudo verificar la agenda de la instalación original.") {
            return null;
          }
          throw error;
        });
        if (verified) {
          const { scope, agendaOwner, professional } = verified;
          const store = shouldStoreCalendarToken({
            email: profile?.email ?? token.email,
            ownerEmail: process.env.GOOGLE_CALENDAR_OWNER_EMAIL,
            hasToken: !!professional.googleRefreshToken,
            hasSyncError: !!professional.googleSyncError,
          });
          if (store) {
            await prisma.professional.updateMany({
              where: {
                id: agendaOwner.professionalId,
                tenantId: scope.tenantId,
                agendas: { some: { id: scope.agendaId, tenantId: scope.tenantId, isPrimary: true } },
              },
              data: { googleRefreshToken: account.refresh_token, googleSyncError: null },
            });
          }
        }
      }
      if (account) {
        delete token.privateContentUserId;
        const subject = profile?.sub;
        if (
          account.provider === "google" &&
          profile?.email_verified === true &&
          typeof subject === "string" && subject.length > 0 &&
          subject === account.providerAccountId
        ) {
          const boundUser = await prisma.user.findUnique({
            where: { googleSubject: subject },
            select: { id: true },
          });
          if (boundUser) token.privateContentUserId = boundUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.privateContentUserId === "string" && token.privateContentUserId) {
        session.privateContentUserId = token.privateContentUserId;
      }
      return session;
    },
  },
});
