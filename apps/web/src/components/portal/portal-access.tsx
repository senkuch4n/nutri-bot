"use client";

import { useSearchParams } from "next/navigation";
import { Clock, MessageCircle } from "lucide-react";
import { PORTAL_TEXT } from "@nutri-bot/core";
import { Wordmark } from "@/components/brand";
import { buttonVariants } from "@/components/primitives/button";
import { cn } from "@/lib/utils";

type AccessProps = { professionalName: string | null; whatsappUrl: string | null };

/** HU-017d-1 (D8, Q2): el layout no recibe searchParams; este gate lee `?error=invalid` en el cliente.
 *  Va dentro de un <Suspense> cuyo fallback es la variante "no-link". */
export function PortalAccessGate({ professionalName, whatsappUrl }: AccessProps) {
  const expired = useSearchParams().get("error") === "invalid";
  return (
    <PortalAccessScreen
      variant={expired ? "expired" : "no-link"}
      professionalName={professionalName}
      whatsappUrl={whatsappUrl}
    />
  );
}

/** Pone en <strong> la palabra "portal" (lo que hay que escribirle al bot). */
function withKeyword(text: string) {
  const [before, ...rest] = text.split("portal");
  return (
    <>
      {before}
      <strong className="font-semibold text-foreground">portal</strong>
      {rest.join("portal")}
    </>
  );
}

/** Pantalla sin sesión: "sin link" o "link vencido". Ids fijos (T9e): no usa useId. */
export function PortalAccessScreen({
  variant,
  professionalName,
  whatsappUrl,
}: AccessProps & { variant: "no-link" | "expired" }) {
  const expired = variant === "expired";
  return (
    <div className="theme-portal grid min-h-[100dvh] place-items-center bg-grouped px-4 py-8 text-foreground">
      <div
        role="region"
        aria-labelledby="portal-access-title"
        className="w-full max-w-sm rounded-xl bg-card p-8 text-center shadow-card more-contrast:border more-contrast:border-input"
      >
        <Wordmark subtitle={professionalName} className="mb-6 justify-center" />
        {expired ? (
          <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-secondary">
            <Clock className="size-7 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          </span>
        ) : null}
        <h1 id="portal-access-title" className="text-balance text-title-2">
          {expired ? PORTAL_TEXT.expiredTitle : PORTAL_TEXT.noLinkTitle}
        </h1>
        <p className="mt-3 text-pretty text-body-lg text-muted-foreground">
          {withKeyword(expired ? PORTAL_TEXT.expiredBody : PORTAL_TEXT.noLinkBody)}
        </p>
        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "tinted", size: "lg" }), "mt-6 w-full")}
          >
            <MessageCircle aria-hidden />
            {PORTAL_TEXT.writeWhatsapp}
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
