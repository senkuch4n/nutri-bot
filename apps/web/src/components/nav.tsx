import { signOut } from "@/auth";
import { Wordmark } from "./brand";
import { NavLinks } from "./nav-links";

export function Nav({ userEmail }: { userEmail?: string | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3">
        <div className="flex items-center gap-8">
          <Wordmark />
          <div className="hidden md:block">
            <NavLinks />
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {userEmail ? (
            <span className="hidden text-ink-faint lg:inline">{userEmail}</span>
          ) : null}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/inicio" });
            }}
          >
            <button className="border-2 border-ink px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-ink hover:text-white">
              Salir
            </button>
          </form>
        </div>
      </div>

      <div className="overflow-x-auto border-t border-line px-2 py-1.5 md:hidden">
        <NavLinks />
      </div>
    </header>
  );
}
