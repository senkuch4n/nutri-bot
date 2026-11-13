import { CircleCheck, CircleSlash } from "lucide-react";
import {
  MERCADOPAGO_TEXT as MP,
  PROFESSIONAL_TEXT,
  SETTINGS_TEXT as T,
  formatPhone,
  professionalLogoNotice,
  professionalSignatureLines,
  shouldWarnDepositWithoutMercadoPago,
  type MercadoPagoConnectionStatus,
} from "@nutri-bot/core";
import { prisma } from "@nutri-bot/db";
import { getMercadoPagoConnectionView } from "@nutri-bot/db/domain";
import { signIn } from "@/auth";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { Alert, Button, ButtonLink } from "@/components/ui";
import { getBotAiKeyStatus } from "@/lib/bot-ai";
import { getProfessional } from "@/lib/professional";
import { DetailDisclosure } from "../pacientes/[id]/detail-disclosure";
import { AfterHoursForm } from "./after-hours-form";
import { AjustesTabs } from "./ajustes-tabs";
import { BotAiForm } from "./bot-ai-form";
import { BotToggle } from "./bot-toggle";
import { GeneralForm } from "./general-form";
import { GoogleCalendarForm, GoogleDisconnectButton } from "./google-calendar-form";
import { LogoForm } from "./logo-form";
import {
  MercadoPagoCallbackBanner,
  MercadoPagoConnectButton,
  MercadoPagoDisconnectButton,
} from "./mercadopago-section";
import { PdfStyleForm } from "./pdf-style-form";
import { SignatureForm } from "./signature-form";
import { SignatureIdentityForm } from "./signature-identity-form";

export const dynamic = "force-dynamic";

/** Ícono + texto: el estado no depende solo del color. */
function StatusValue({ ok, children }: { ok: boolean; children: string }) {
  const Icon = ok ? CircleCheck : CircleSlash;
  return (
    <span className={ok ? "inline-flex items-center gap-1.5 text-success" : "inline-flex items-center gap-1.5 text-destructive"}>
      <Icon className="size-4" strokeWidth={2} aria-hidden />
      {children}
    </span>
  );
}

/** HU-023: estado de la cuenta de Mercado Pago, con ícono + texto. "No conectada" en tono neutro salvo
 *  que haya servicios con seña (ahí es una alerta). */
function mercadoPagoStatusLabel(status: MercadoPagoConnectionStatus): string {
  switch (status) {
    case "connected":
      return MP.connected;
    case "needs_reconnect":
      return MP.needsReconnect;
    case "not_configured":
      return MP.notConfigured;
    default:
      return MP.notConnected;
  }
}

/** "12 de noviembre de 2026" en la zona de la profesional. */
function formatConnectedAt(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: tz }).format(date);
}

export default async function AjustesPage() {
  const [pro, botStatus, logo, mp] = await Promise.all([
    getProfessional(),
    prisma.botStatus.findUnique({ where: { id: 1 } }),
    prisma.professional.findUnique({ where: { id: 1 }, select: { logoData: true } }),
    getMercadoPagoConnectionView(),
  ]);
  const googleConnected = Boolean(pro.googleRefreshToken);
  const botConnected = botStatus?.connected ?? false;
  const calendarId = pro.googleCalendarId ?? "";
  const usesMainCalendar = calendarId === "" || calendarId === "primary";
  const phoneDigits = pro.phoneJid?.split("@")[0] ?? "";

  const banner = botConnected ? null : (
    <Alert tone="danger" title={T.botDisconnected}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>{T.botDisconnectedHelp}</p>
        <ButtonLink href="/ajustes/whatsapp">{T.connectWhatsapp}</ButtonLink>
      </div>
    </Alert>
  );

  const general = (
    <GeneralForm
      defaults={{
        timezone: pro.timezone,
        currency: pro.currency,
        phone: phoneDigits ? formatPhone(phoneDigits) : "",
        acceptedInsurances: pro.acceptedInsurances ?? "",
      }}
    />
  );

  const whatsapp = (
    <>
      <GroupedList>
        <GroupedListRow
          label={T.connection}
          href="/ajustes/whatsapp"
          value={<StatusValue ok={botConnected}>{botConnected ? T.connected : T.disconnected}</StatusValue>}
        />
        <BotToggle paused={pro.botPaused} />
      </GroupedList>
      <AfterHoursForm
        defaults={{
          enabled: pro.afterHoursEnabled,
          attendFrom: pro.afterHoursEnd,
          attendTo: pro.afterHoursStart,
        }}
      />
      <BotAiForm defaults={{ enabled: pro.botAiEnabled, info: pro.botAiInfo ?? "" }} keyStatus={getBotAiKeyStatus()} />
    </>
  );

  const google = (
    <>
      {pro.googleSyncError ? (
        <Alert tone="danger">
          <p>{T.googleSyncError}</p>
          <DetailDisclosure label={T.technicalDetail}>
            <p className="break-words text-footnote text-muted-foreground" translate="no">
              {pro.googleSyncError}
            </p>
          </DetailDisclosure>
        </Alert>
      ) : null}
      <div>
        <GroupedList footer={T.googleHelp}>
          <GroupedListRow
            label="Estado"
            value={
              <StatusValue ok={googleConnected}>{googleConnected ? T.googleConnected : T.googleNotConnected}</StatusValue>
            }
          />
          {googleConnected ? (
            <GroupedListRow
              label={T.googleCalendar}
              value={usesMainCalendar ? T.googleMainCalendar : T.googleOtherCalendar}
            />
          ) : null}
        </GroupedList>
        <div className="mt-3 flex flex-wrap items-center gap-3 px-4">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/ajustes?tab=google" });
            }}
          >
            <Button type="submit" variant={googleConnected ? "secondary" : "primary"}>
              {googleConnected ? T.googleReconnect : T.googleConnect}
            </Button>
          </form>
          {googleConnected ? <GoogleDisconnectButton /> : null}
        </div>
      </div>
      {googleConnected ? (
        <div className="px-4">
          <DetailDisclosure label={T.googleAdvanced}>
            <GoogleCalendarForm defaultId={calendarId} />
          </DetailDisclosure>
        </div>
      ) : null}
    </>
  );

  // HU-023: Ajustes → Mercado Pago (4 estados: no configurada, sin cuenta, conectada, hay que reconectar).
  const mpHasAccount = mp.status === "connected" || mp.status === "needs_reconnect";
  const mpStatusValue =
    mp.status === "connected" ? (
      <StatusValue ok>{MP.connected}</StatusValue>
    ) : mp.status === "needs_reconnect" || (mp.status === "not_connected" && mp.hasActiveDepositServices) ? (
      <StatusValue ok={false}>{mercadoPagoStatusLabel(mp.status)}</StatusValue>
    ) : (
      <span className="text-muted-foreground">{mercadoPagoStatusLabel(mp.status)}</span>
    );
  const mercadopago = (
    <>
      <MercadoPagoCallbackBanner />
      {mp.status === "needs_reconnect" && mp.errorCode ? (
        <Alert tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>{MP.errorAlert(MP.errorReasons[mp.errorCode])}</p>
            <MercadoPagoConnectButton reconnect />
          </div>
        </Alert>
      ) : null}
      {mp.status === "not_configured" ? (
        <Alert tone="warning">
          <p>{MP.callback.not_configured}</p>
        </Alert>
      ) : null}
      <div>
        <GroupedList footer={mpHasAccount ? undefined : MP.help}>
          <GroupedListRow
            label={MP.account}
            value={mpStatusValue}
            description={mpHasAccount && mp.liveMode === false ? MP.testAccount : undefined}
          />
          {mpHasAccount && (mp.nickname || mp.email) ? (
            <GroupedListRow
              label={MP.user}
              value={
                <span className="flex max-w-[11rem] flex-col items-end text-right sm:max-w-xs">
                  <span className="break-all" translate="no">{mp.nickname ?? mp.email}</span>
                  {mp.nickname && mp.email ? (
                    <span className="break-all text-footnote text-muted-foreground" translate="no">{mp.email}</span>
                  ) : null}
                </span>
              }
            />
          ) : null}
          {mpHasAccount && mp.userId ? (
            <GroupedListRow label={MP.userId} value={<span translate="no" className="tabular-nums">{mp.userId}</span>} />
          ) : null}
          {mpHasAccount && mp.connectedAt ? (
            <GroupedListRow label={MP.connectedAt} value={formatConnectedAt(mp.connectedAt, pro.timezone)} />
          ) : null}
        </GroupedList>
        <div className="mt-3 flex flex-wrap items-center gap-3 px-4">
          {mp.status === "connected" ? (
            <>
              <MercadoPagoConnectButton reconnect variant="secondary" />
              <MercadoPagoDisconnectButton pendingDepositCount={mp.pendingDepositCount} />
            </>
          ) : mp.status === "needs_reconnect" ? (
            <MercadoPagoDisconnectButton pendingDepositCount={mp.pendingDepositCount} />
          ) : (
            <MercadoPagoConnectButton disabled={mp.status === "not_configured"} />
          )}
        </div>
      </div>
    </>
  );

  const mercadoPagoBanner = shouldWarnDepositWithoutMercadoPago(mp) ? (
    <Alert tone="warning" title={MP.depositWarningTitle}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>{MP.depositWarningBody}</p>
        <ButtonLink href="/ajustes?tab=mercadopago" variant="secondary">
          {MP.depositWarningAction}
        </ButtonLink>
      </div>
    </Alert>
  ) : null;

  const pdf = (
    <>
      <SignatureIdentityForm
        defaults={{ title: pro.title ?? "", licenseNumber: pro.licenseNumber ?? "" }}
        description={PROFESSIONAL_TEXT.cardDescription}
      />
      <section>
        <h3 className="px-4 pb-1.5 text-subheadline font-medium text-muted-foreground">Firma</h3>
        <div className="rounded-xl bg-card p-4 shadow-card more-contrast:border more-contrast:border-input">
          <SignatureForm
            hasSignature={pro.signatureMimeType !== null}
            version={pro.updatedAt.getTime()}
            lines={professionalSignatureLines({ title: pro.title, name: pro.name, licenseNumber: pro.licenseNumber })}
          />
        </div>
      </section>
      <section>
        <h3 className="px-4 pb-1.5 text-subheadline font-medium text-muted-foreground">{T.logoTitle}</h3>
        <div className="rounded-xl bg-card p-4 shadow-card more-contrast:border more-contrast:border-input">
          <LogoForm
            hasLogo={Boolean(logo?.logoData)}
            version={pro.updatedAt.getTime()}
            unsupportedNotice={logo?.logoData ? professionalLogoNotice(pro.logoMimeType) : null}
          />
        </div>
        <p className="px-4 pt-1.5 text-footnote text-muted-foreground">{PROFESSIONAL_TEXT.logoDescription}</p>
      </section>
      <PdfStyleForm defaults={{ pdfAccentColor: pro.pdfAccentColor ?? "", pdfFooterText: pro.pdfFooterText ?? "" }} />
    </>
  );

  return (
    <AjustesTabs
      panels={{ general, whatsapp, google, mercadopago, pdf }}
      summaries={{
        whatsapp: botConnected ? T.connected : T.disconnected,
        google: googleConnected ? T.googleConnected : T.googleNotConnected,
        mercadopago: mercadoPagoStatusLabel(mp.status),
      }}
      banner={banner}
      mercadoPagoBanner={mercadoPagoBanner}
    />
  );
}
