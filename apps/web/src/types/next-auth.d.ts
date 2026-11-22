import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    /** HU-025: User registrado por la identidad de Google verificada. Rol y tenant se leen por request. */
    userId?: string;
    /** @deprecated HU-024; se retira junto con el cambio de private-content-access.ts. */
    privateContentUserId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** HU-025: User registrado por la identidad de Google verificada. El JWT no guarda rol ni tenant. */
    userId?: string;
  }
}
