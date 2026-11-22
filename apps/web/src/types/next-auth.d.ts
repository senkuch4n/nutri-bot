import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    /** HU-025: User registrado por la identidad de Google verificada. Rol y tenant se leen por request. */
    userId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** HU-025: User registrado por la identidad de Google verificada. El JWT no guarda rol ni tenant. */
    userId?: string;
  }
}
