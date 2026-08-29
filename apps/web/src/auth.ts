import NextAuth from "next-auth";
import { prisma } from "@nutri-bot/db";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account }) {
      // En el login con Google guardamos el refresh_token en la ficha
      // de la profesional para que el bot pueda sincronizar el calendario.
      if (account?.provider === "google" && account.refresh_token) {
        await prisma.professional.update({
          where: { id: 1 },
          data: { googleRefreshToken: account.refresh_token, googleSyncError: null },
        });
      }
      return token;
    },
  },
});
