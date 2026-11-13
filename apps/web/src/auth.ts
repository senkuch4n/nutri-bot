import NextAuth from "next-auth";
import { prisma } from "@nutri-bot/db";
import { authConfig } from "./auth.config";
import { shouldStoreCalendarToken } from "./lib/calendar-token-owner";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, profile }) {
      // En el login con Google guardamos el refresh_token en la ficha de la profesional para
      // que el bot pueda sincronizar el calendario, pero solo el de la dueña del calendario
      // (ver `shouldStoreCalendarToken`): otro login no puede pisarlo.
      if (account?.provider === "google" && account.refresh_token) {
        const pro = await prisma.professional.findUnique({
          where: { id: 1 },
          select: { googleRefreshToken: true, googleSyncError: true },
        });
        const store = shouldStoreCalendarToken({
          email: profile?.email ?? token.email,
          ownerEmail: process.env.GOOGLE_CALENDAR_OWNER_EMAIL,
          hasToken: !!pro?.googleRefreshToken,
          hasSyncError: !!pro?.googleSyncError,
        });
        if (store) {
          await prisma.professional.update({
            where: { id: 1 },
            data: { googleRefreshToken: account.refresh_token, googleSyncError: null },
            select: { id: true },
          });
        }
      }
      return token;
    },
  },
});
