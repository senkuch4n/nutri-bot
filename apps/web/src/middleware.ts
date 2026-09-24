import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // /portal no usa el login de Google: cada página valida la sesión del paciente (patient-session.ts).
  matcher: ["/((?!api/auth|login|inicio|portal|_next/static|_next/image|favicon.ico).*)"],
};
