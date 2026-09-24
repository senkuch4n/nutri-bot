import { prisma } from "@nutri-bot/db";
import { formatInTimeZone } from "@nutri-bot/core";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
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
    <div>
      <AutoRefresh seconds={5} />

      <PageHeader
        title="Vinculación de WhatsApp"
        description="El bot corre como un proceso aparte. Escaneá el QR para vincular el número."
        back={{ href: "/ajustes?tab=whatsapp", label: "Volver a ajustes" }}
      />

      <Card title="Estado" className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {connected ? <Badge tone="success">Conectado</Badge> : <Badge tone="danger">Desconectado</Badge>}
          {status?.lastConnectedAt ? (
            <span className="tabular-nums text-muted-foreground">
              Última conexión: {formatInTimeZone(status.lastConnectedAt, pro.timezone, "dd/MM/yyyy · HH:mm")}
            </span>
          ) : null}
        </div>

        {!connected && status?.qr ? (
          <div className="mt-6">
            <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Abrí WhatsApp en el teléfono.</li>
              <li>
                Entrá a <strong className="font-medium text-foreground">Dispositivos vinculados</strong> →
                Vincular un dispositivo.
              </li>
              <li>Escaneá este código.</li>
            </ol>
            {status.qr.startsWith("data:image") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={status.qr}
                alt="Código QR para vincular WhatsApp"
                width={240}
                height={240}
                className="h-60 w-60 rounded-md border"
              />
            ) : (
              <pre className="overflow-x-auto rounded-md bg-foreground p-4 text-xs leading-none text-background">
                {status.qr}
              </pre>
            )}
          </div>
        ) : null}

        {!connected && !status?.qr ? (
          <Alert tone="info" title="Esperando al bot…" className="mt-4">
            Verificá que el proceso esté corriendo (
            <code className="rounded bg-muted px-1 font-mono text-xs">npm run dev:bot</code>).
          </Alert>
        ) : null}

        {connected ? (
          <p className="mt-4 text-sm text-muted-foreground">El número está vinculado y el bot está operativo.</p>
        ) : null}
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">Esta página se actualiza sola cada pocos segundos.</p>
    </div>
  );
}
