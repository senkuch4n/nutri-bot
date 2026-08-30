import Link from "next/link";
import { prisma } from "@nutri-bot/db";
import { formatInTimeZone } from "@nutri-bot/core";
import { Badge, Card, PageHeader, SectionLabel } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { getProfessional } from "@/lib/professional";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WhatsAppStatusPage() {
  const [pro, status] = await Promise.all([
    getProfessional(),
    prisma.botStatus.findUnique({ where: { id: 1 } }),
  ]);

  const connected = status?.connected ?? false;

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={5} />

      <div>
        <Link
          href="/ajustes"
          className="text-sm text-ink-soft transition-colors hover:text-ink"
        >
          ← Volver a ajustes
        </Link>
        <div className="mt-3">
          <PageHeader
            title="Vinculación de WhatsApp"
            description="El bot corre como un proceso aparte. Escaneá el QR para vincular el número."
          />
        </div>
      </div>

      <Card>
        <SectionLabel>Estado</SectionLabel>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {connected ? (
            <Badge tone="green">Conectado</Badge>
          ) : (
            <Badge tone="red">Desconectado</Badge>
          )}
          {status?.lastConnectedAt ? (
            <span className="text-ink-soft">
              Última conexión:{" "}
              {formatInTimeZone(status.lastConnectedAt, pro.timezone, "dd/MM/yyyy · HH:mm")}
            </span>
          ) : null}
        </div>

        {!connected && status?.qr ? (
          <div className="mt-6">
            <p className="mb-3 text-sm text-ink-soft">
              En el teléfono: WhatsApp → <strong>Dispositivos vinculados</strong> → Vincular un
              dispositivo, y escaneá:
            </p>
            {status.qr.startsWith("data:image") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={status.qr}
                alt="Código QR para vincular WhatsApp"
                className="h-60 w-60 border border-line"
              />
            ) : (
              <pre className="overflow-x-auto bg-ink p-4 text-xs leading-none text-leaf-bright">
                {status.qr}
              </pre>
            )}
          </div>
        ) : null}

        {!connected && !status?.qr ? (
          <p className="mt-4 text-sm text-ink-soft">
            Esperando al bot… Verificá que el proceso esté corriendo (
            <code className="bg-mint px-1">npm run dev:bot</code>).
          </p>
        ) : null}

        {connected ? (
          <p className="mt-4 text-sm text-ink-soft">
            El número está vinculado y el bot está operativo.
          </p>
        ) : null}
      </Card>

      <p className="text-xs text-ink-faint">Esta página se actualiza sola cada pocos segundos.</p>
    </div>
  );
}
