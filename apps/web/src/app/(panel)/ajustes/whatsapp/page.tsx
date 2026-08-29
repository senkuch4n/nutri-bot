import { prisma } from "@nutri-bot/db";
import { formatInTimeZone } from "@nutri-bot/core";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { getProfessional } from "@/lib/professional";

export const dynamic = "force-dynamic";

// Refresca la página cada 5s mientras se espera el escaneo del QR.
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
      <PageHeader
        title="WhatsApp"
        description="El bot corre como proceso aparte. Escaneá el QR para vincular el número."
      />

      <Card>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Estado del bot:</span>
          {connected ? <Badge tone="green">Conectado</Badge> : <Badge tone="red">Desconectado</Badge>}
          {status?.lastConnectedAt ? (
            <span className="text-sm text-slate-400">
              Última conexión: {formatInTimeZone(status.lastConnectedAt, pro.timezone, "dd/MM/yyyy HH:mm")}
            </span>
          ) : null}
        </div>

        {!connected && status?.qr ? (
          <div className="mt-6">
            <p className="mb-3 text-sm text-slate-500">
              Abrí WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escaneá:
            </p>
            {status.qr.startsWith("data:image") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={status.qr} alt="Código QR de WhatsApp" className="h-64 w-64" />
            ) : (
              <pre className="overflow-x-auto rounded bg-slate-900 p-4 text-xs leading-none text-green-400">
                {status.qr}
              </pre>
            )}
          </div>
        ) : null}

        {!connected && !status?.qr ? (
          <p className="mt-4 text-sm text-slate-500">
            Esperando al bot… Asegurate de que el proceso esté corriendo (<code>npm run dev:bot</code>).
          </p>
        ) : null}

        {connected ? (
          <p className="mt-4 text-sm text-slate-500">El número está vinculado y el bot está operativo.</p>
        ) : null}
      </Card>

      <p className="text-xs text-slate-400">
        Esta página se actualiza sola cada pocos segundos.
      </p>
    </div>
  );
}
