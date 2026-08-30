import Link from "next/link";
import { prisma } from "@nutri-bot/db";
import { signIn } from "@/auth";
import { Badge, Button, Card, PageHeader, SectionLabel } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { SettingsForm } from "./settings-form";
import { GoogleCalendarForm } from "./google-calendar-form";
import { BotToggle } from "./bot-toggle";
import { disconnectGoogleAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const [pro, botStatus] = await Promise.all([
    getProfessional(),
    prisma.botStatus.findUnique({ where: { id: 1 } }),
  ]);
  const googleConnected = Boolean(pro.googleRefreshToken);
  const botConnected = botStatus?.connected ?? false;

  return (
    <div className="space-y-6">
      <PageHeader title="Ajustes" description="Configuración del panel, el bot y las integraciones." />

      {/* Bot de WhatsApp */}
      <Card>
        <SectionLabel>Bot de WhatsApp</SectionLabel>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-soft">Conexión:</span>
            {botConnected ? (
              <Badge tone="green">Conectado</Badge>
            ) : (
              <Badge tone="red">Desconectado</Badge>
            )}
          </div>
          <Link
            href="/ajustes/whatsapp"
            className="text-sm font-medium text-ink transition-colors hover:text-leaf-deep"
          >
            Ver QR y vinculación →
          </Link>
        </div>

        <p className="mb-4 mt-4 text-sm leading-relaxed text-ink-soft">
          El bot nunca contesta mensajes comunes: solo se activa cuando alguien escribe una palabra
          clave como <em>turno</em>, <em>turnos</em> o <em>menú</em>. Igual podés apagarlo del todo.
        </p>
        <BotToggle paused={pro.botPaused} />
      </Card>

      {/* General */}
      <Card>
        <SectionLabel>General</SectionLabel>
        <SettingsForm
          defaults={{
            timezone: pro.timezone,
            currency: pro.currency,
            reminderLeadHours: pro.reminderLeadHours,
            phone: pro.phoneJid?.split("@")[0] ?? "",
          }}
        />
      </Card>

      {/* Google Calendar */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <SectionLabel>Google Calendar</SectionLabel>
            <p className="text-sm text-ink-soft">
              Sincroniza los turnos confirmados con tu calendario de Google.
            </p>
          </div>
          {googleConnected ? (
            <Badge tone="green">Conectado</Badge>
          ) : (
            <Badge tone="amber">Sin conectar</Badge>
          )}
        </div>

        {pro.googleSyncError ? (
          <p className="mt-3 border-l-2 border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700">
            Error de sincronización: {pro.googleSyncError}. Reconectá para renovar el permiso.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/ajustes" });
            }}
          >
            <Button type="submit" variant="secondary">
              {googleConnected ? "Reconectar" : "Conectar Google Calendar"}
            </Button>
          </form>
          {googleConnected ? (
            <form action={disconnectGoogleAction}>
              <Button type="submit" variant="ghost">
                Desconectar
              </Button>
            </form>
          ) : null}
        </div>

        {googleConnected ? <GoogleCalendarForm defaultId={pro.googleCalendarId ?? ""} /> : null}
      </Card>
    </div>
  );
}
