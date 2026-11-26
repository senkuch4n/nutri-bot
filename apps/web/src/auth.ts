import NextAuth from "next-auth";
import { registerGoogleIdentity } from "@nutri-bot/db/domain";
import { authConfig, verifiedGoogleIdentity } from "./auth.config";

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
      const identity = verifiedGoogleIdentity(account, profile);
      if (!identity) return token;

      const registration = await registerGoogleIdentity(identity);
      if (registration.status !== "linked") {
        console.warn("[auth] identity_conflict");
        return token;
      }
      // HU-028b (D15): el login no guarda ni pisa tokens de Google; nada de Google viaja en el JWT.
      token.userId = registration.userId;
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
