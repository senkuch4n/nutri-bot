import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { sidebarItemClass } from "./nav-config";

/** Server component: el action inline de signOut es el mismo que tenía nav.tsx, sin cambios. */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/inicio" });
      }}
    >
      <button
        type="submit"
        className={`${sidebarItemClass} group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0`}
      >
        <LogOut className="h-4 w-4 shrink-0" aria-hidden />
        <span className="group-data-[collapsed=true]/sidebar:sr-only">Cerrar sesión</span>
      </button>
    </form>
  );
}
