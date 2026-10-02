import { QrCode } from "lucide-react";
import { professionalSignature } from "@nutri-bot/core";
import { prisma } from "@nutri-bot/db";
import { signIn } from "@/auth";
import { Separator } from "@/components/primitives/separator";
import { Alert, Badge, Button, ButtonLink, Card, PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { AjustesTabs } from "./ajustes-tabs";
import {
  SettingsFormProvider,
  SettingsGeneralFields,
  SettingsPdfFields,
  SettingsSignatureFields,
  type SettingsDefaults,
} from "./settings-form";
import { GoogleCalendarForm } from "./google-calendar-form";
import { BotToggle } from "./bot-toggle";
import { AfterHoursForm } from "./after-hours-form";
import { LogoForm } from "./logo-form";
import { disconnectGoogleAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AjustesPage() {
  const [pro, botStatus, logo] = await Promise.all([
    getProfessional(),
    prisma.botStatus.findUnique({ where: { id: 1 } }),
    prisma.professional.findUnique({ where: { id: 1 }, select: { logoData: true } }),
  ]);
  const googleConnected = Boolean(pro.googleRefreshToken);
  const botConnected = botStatus?.connected ?? false;

  const defaults: SettingsDefaults = {
    timezone: pro.timezone,
    currency: pro.currency,
    reminderLeadHours: pro.reminderLeadHours,
    phone: pro.phoneJid?.split("@")[0] ?? "",
    acceptedInsurances: pro.acceptedInsurances ?? "",
    pdfAccentColor: pro.pdfAccentColor ?? "",
    pdfFooterText: pro.pdfFooterText ?? "",
    title: pro.title ?? "",
    licenseNumber: pro.licenseNumber ?? "",
  };

  const general = (
    <Card title="General" description="Zona horaria, moneda, recordatorios y datos que usa el bot.">
      <SettingsGeneralFields defaults={defaults} />
    </Card>
  );

  const whatsapp = (
    <Card
      title="Bot de WhatsApp"
      description="El bot nunca contesta mensajes comunes: solo se activa cuando alguien escribe una palabra clave como turno, turnos o menú. Igual podés apagarlo del todo."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Conexión</span>
          {botConnected ? <Badge tone="success">Conectado</Badge> : <Badge tone="danger">Desconectado</Badge>}
        </div>
        <ButtonLink variant="secondary" size="sm" href="/ajustes/whatsapp">
          <QrCode aria-hidden />
          Ver QR y vinculación
        </ButtonLink>
      </div>
      <Separator className="my-4" />
      <BotToggle paused={pro.botPaused} />
      <Separator className="my-4" />
      <AfterHoursForm
        defaults={{
          enabled: pro.afterHoursEnabled,
          attendFrom: pro.afterHoursEnd,
          attendTo: pro.afterHoursStart,
        }}
      />
    </Card>
  );

  const google = (
    <Card
      title="Google Calendar"
      description="Sincroniza los turnos confirmados con tu calendario de Google."
      actions={googleConnected ? <Badge tone="success">Conectado</Badge> : <Badge tone="warning">Sin conectar</Badge>}
    >
      {pro.googleSyncError ? (
        <Alert tone="danger" title="Error de sincronización" className="mb-4">
          {pro.googleSyncError}. Reconectá para renovar el permiso.
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-3">
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
  );

  const pdf = (
    <div className="space-y-6">
      <Card
        title="Firma de los informes"
        description="Tu título y matrícula aparecen al pie del informe antropométrico."
      >
        <SettingsSignatureFields
          defaults={defaults}
          signaturePreview={professionalSignature({ title: pro.title, name: pro.name, licenseNumber: pro.licenseNumber })}
        />
      </Card>
      <Card
        title="Logo"
        description="Este logo aparece en los PDFs de los planes alimentarios que le enviás a tus pacientes."
      >
        <LogoForm hasLogo={Boolean(logo?.logoData)} />
      </Card>
      <Card title="Estilo del PDF" description="Color y pie de página del PDF del plan.">
        <SettingsPdfFields defaults={defaults} />
      </Card>
    </div>
  );

  return (
    <div>
      <PageHeader title="Ajustes" description="Configuración del panel, el bot y las integraciones." />
      <SettingsFormProvider>
        <AjustesTabs panels={{ general, whatsapp, google, pdf }} />
      </SettingsFormProvider>
    </div>
  );
}
