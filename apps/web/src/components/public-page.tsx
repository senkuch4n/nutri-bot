import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand";

/** Mail de contacto de Arzium que figura en las páginas públicas (privacidad, pedidos de datos). */
export const ARZIUM_CONTACT_EMAIL = "arzium.dev@gmail.com";

/** Pie compartido por las páginas públicas y la pantalla de login (requisito de Google: el link a
 *  la política de privacidad tiene que verse desde la página de inicio). */
export function PublicFooterLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Información" className={className}>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-footnote text-muted-foreground">
        <li>
          <Link href="/acerca" className="underline-offset-4 hover:underline">
            Qué es Numa
          </Link>
        </li>
        <li>
          <Link href="/privacidad" className="underline-offset-4 hover:underline">
            Política de privacidad
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/** Marco de las páginas públicas de texto (/acerca, /privacidad): sin login ni datos de la base. */
export function PublicPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-grouped px-4 py-12">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex justify-center">
          <Link href="/inicio" aria-label="Ir al inicio de Numa">
            <Wordmark />
          </Link>
        </div>
        <article className="rounded-xl bg-card p-6 shadow-card sm:p-8 more-contrast:border more-contrast:border-input">
          <h1 className="text-balance text-title-1">{title}</h1>
          {updated ? <p className="mt-1 text-footnote text-muted-foreground">Última actualización: {updated}</p> : null}
          <div className="mt-6 space-y-4 text-body [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-8 [&_h2]:text-title-3 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
            {children}
          </div>
        </article>
        <PublicFooterLinks className="mt-6" />
      </div>
    </main>
  );
}
