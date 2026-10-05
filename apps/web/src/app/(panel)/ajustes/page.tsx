import { CircleCheck, CircleSlash } from "lucide-react";
import {
  PROFESSIONAL_TEXT,
  SETTINGS_TEXT as T,
  formatPhone,
  professionalLogoNotice,
  professionalSignatureLines,
} from "@nutri-bot/core";
import { prisma } from "@nutri-bot/db";
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

export default async function AjustesPage() {
  const [pro, botStatus, logo] = await Promise.all([
    getProfessional(),
    prisma.botStatus.findUnique({ where: { id: 1 } }),
    prisma.professional.findUnique({ where: { id: 1 }, select: { logoData: true } }),
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
      panels={{ general, whatsapp, google, pdf }}
      summaries={{
        whatsapp: botConnected ? T.connected : T.disconnected,
        google: googleConnected ? T.googleConnected : T.googleNotConnected,
      }}
      banner={banner}
    />
  );
}
