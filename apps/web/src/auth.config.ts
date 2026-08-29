import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Configuración segura para el Edge (sin Prisma). La usa el middleware
 * y se extiende en `auth.ts` con callbacks que tocan la base de datos.
 */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
        },
      },
    }),
  ],
  callbacks: {
    authorized({ auth }) {
      const email = auth?.user?.email?.toLowerCase();
      return !!email && allowedEmails.includes(email);
    },
    signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      return !!email && allowedEmails.includes(email);
    },
  },
} satisfies NextAuthConfig;
