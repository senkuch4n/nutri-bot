import Link from "next/link";
import { signIn } from "@/auth";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { SettingsForm } from "./settings-form";
import { BotToggle } from "./bot-toggle";
import { disconnectGoogleAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const pro = await getProfessional();
  const googleConnected = Boolean(pro.googleRefreshToken);

  return (
    <div className="space-y-6">
      <PageHeader title="Ajustes" description="Configuración general del panel y las integraciones." />

      <Card>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Bot de WhatsApp
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          El bot nunca contesta mensajes comunes: solo se activa cuando alguien escribe una palabra
          clave como <em>turno</em>, <em>turnos</em> o <em>menú</em>. Igual podés apagarlo del todo.
        </p>
        <BotToggle paused={pro.botPaused} />
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">General</h2>
        <SettingsForm
          defaults={{
            timezone: pro.timezone,
            currency: pro.currency,
            reminderLeadHours: pro.reminderLeadHours,
            googleCalendarId: pro.googleCalendarId ?? "",
            phoneJid: pro.phoneJid ?? "",
          }}
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Google Calendar
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Sincroniza los turnos confirmados con el calendario de la profesional.
            </p>
          </div>
          {googleConnected ? <Badge tone="green">Conectado</Badge> : <Badge tone="amber">Sin conectar</Badge>}
        </div>

        {pro.googleSyncError ? (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Error de sincronización: {pro.googleSyncError}. Reconectá para renovar el permiso.
          </p>
        ) : null}

        <div className="mt-4 flex gap-3">
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
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">WhatsApp</h2>
            <p className="mt-1 text-sm text-slate-500">Estado del bot y vinculación por QR.</p>
          </div>
          <Link href="/ajustes/whatsapp" className="text-sm font-medium text-brand hover:underline">
            Ver estado →
          </Link>
        </div>
      </Card>
    </div>
  );
}
