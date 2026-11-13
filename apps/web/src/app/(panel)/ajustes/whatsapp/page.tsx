import { CircleCheck, CircleSlash } from "lucide-react";
import { prisma } from "@nutri-bot/db";
import { SETTINGS_TEXT as T, formatInTimeZone } from "@nutri-bot/core";
import { AutoRefresh } from "@/components/auto-refresh";
import { Alert, ButtonLink, PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { DetailDisclosure } from "../../pacientes/[id]/detail-disclosure";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Vinculación de WhatsApp (HU-017b-4, §4.8): estado grande, pasos con números de 28 px y el código de al
 * menos 264 px. Solo lee `BotStatus`: no pide un código nuevo ni desvincula nada.
 */
export default async function WhatsAppStatusPage() {
  const [pro, status] = await Promise.all([
    getProfessional(),
    prisma.botStatus.findUnique({ where: { id: 1 } }),
  ]);

  const connected = status?.connected ?? false;
  const qr = !connected ? (status?.qr ?? null) : null;
  const StatusIcon = connected ? CircleCheck : CircleSlash;

  return (
    <div className="max-w-3xl">
      <AutoRefresh seconds={5} />

      <PageHeader title={T.linkTitle} description={T.linkDescription} back={{ href: "/ajustes?tab=whatsapp", label: T.back }} />

      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-xl bg-card px-5 py-4 shadow-card more-contrast:border more-contrast:border-input">
          <StatusIcon
            className={connected ? "size-8 shrink-0 text-success" : "size-8 shrink-0 text-destructive"}
            strokeWidth={1.75}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-title-3">{connected ? T.connected : T.disconnected}</p>
            {status?.lastConnectedAt ? (
              <p className="text-callout tabular-nums text-muted-foreground">
                {T.lastConnected(formatInTimeZone(status.lastConnectedAt, pro.timezone, "dd/MM/yyyy · HH:mm"))}
              </p>
            ) : null}
          </div>
        </div>

        {connected ? (
          <div className="space-y-4">
            <p className="text-body">{T.linkDone}</p>
            <ButtonLink href="/ajustes?tab=whatsapp" variant="secondary">
              {T.backToSettings}
            </ButtonLink>
          </div>
        ) : null}

        {qr ? (
          <div className="flex flex-col gap-6 rounded-xl bg-card p-6 shadow-card more-contrast:border more-contrast:border-input md:flex-row md:items-start">
            <ol className="flex-1 space-y-4">
              {T.linkSteps.map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-callout font-semibold tabular-nums text-primary-foreground"
                  >
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-body">
                    <span className="sr-only">Paso {i + 1}: </span>
                    {i === 1 ? (
                      <>
                        Tocá <strong className="font-semibold">Dispositivos vinculados</strong> →{" "}
                        <strong className="font-semibold">Vincular un dispositivo</strong>
                      </>
                    ) : (
                      step
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-col items-center gap-2">
              {qr.startsWith("data:image") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr}
                  alt={T.linkQrAlt}
                  width={280}
                  height={280}
                  className="size-[17.5rem] rounded-lg border bg-white p-2"
                />
              ) : (
                <pre
                  aria-label={T.linkQrAlt}
                  className="min-w-[16.5rem] overflow-x-auto rounded-lg bg-white p-3 text-xs leading-none text-black"
                >
                  {qr}
                </pre>
              )}
              <p className="text-footnote text-muted-foreground">{T.linkAutoRefresh}</p>
            </div>
          </div>
        ) : null}

        {!connected && !qr ? (
          <Alert tone="warning">
            <p>{T.botNotRunning}</p>
            <DetailDisclosure label={T.technicalDetail}>
              <p className="text-footnote text-muted-foreground">
                <code translate="no">{T.botNotRunningDetail}</code>
              </p>
            </DetailDisclosure>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
