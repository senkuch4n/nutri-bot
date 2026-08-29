import Link from "next/link";
import { signOut } from "@/auth";

const links = [
  { href: "/", label: "Calendario" },
  { href: "/servicios", label: "Servicios" },
  { href: "/disponibilidad", label: "Disponibilidad" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/avisos", label: "Avisos" },
  { href: "/ajustes", label: "Ajustes" },
] as const;

export function Nav({ userEmail }: { userEmail?: string | null }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold text-brand">NutriBot</span>
          <nav className="flex gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          {userEmail ? <span className="hidden sm:inline">{userEmail}</span> : null}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100">
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
