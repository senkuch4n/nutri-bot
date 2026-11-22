import type { Account, NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { canonicalEmail } from "@nutri-bot/core";

type GoogleProfile = { sub?: unknown; email?: unknown; email_verified?: unknown } | null | undefined;

/** HU-025 (6.1 paso 1): identidad de Google verificada: proveedor google, email verificado,
 *  sub = providerAccountId y email no vacío. Devuelve el sub y el email canónico, o null. */
export function verifiedGoogleIdentity(
  account: Pick<Account, "provider" | "providerAccountId"> | null | undefined,
  profile: GoogleProfile,
): { subject: string; email: string } | null {
  const subject = profile?.sub;
  const email = profile?.email;
  if (
    !account ||
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

/**
 * Configuración base de Auth.js (sin Prisma). `auth.ts` la extiende con los callbacks que tocan la
 * base. HU-025: ya no hay lista de emails; el acceso se decide por membresía en cada request
 * (middleware y `lib/tenant-context.ts`).
 */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/inicio" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.events",
        },
      },
    }),
  ],
  callbacks: {
    // Cualquier cuenta de Google verificada puede iniciar sesión: sin membresía queda como identidad
    // pendiente y ve el aviso de /inicio. Lo demás → false (Auth.js vuelve a /inicio?error=AccessDenied).
    signIn({ account, profile }) {
      if (verifiedGoogleIdentity(account, profile)) return true;
      console.warn("[auth] sign_in_rejected reason=unverified_identity");
      return false;
    },
  },
} satisfies NextAuthConfig;
