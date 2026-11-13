import { CalendarDays, CircleAlert, MessageCircle, PencilLine } from "lucide-react";
import { prisma } from "@nutri-bot/db";
import {
  PORTAL_TEXT,
  diaryTodayText,
  formatAppointmentWhen,
  formatPrice,
  formatTimeAgo,
  messages,
  portalGreeting,
  portalProfessionalLine,
  professionalWhatsappUrl,
  startOfTodayInTz,
} from "@nutri-bot/core";
import { PortalCardLink } from "@/components/portal/portal-card-link";
import { PortalLogoutButton } from "@/components/portal/portal-logout-button";
import { buttonVariants } from "@/components/primitives/button";
import { ButtonLink, Card, Metric, cn } from "@/components/ui";
import { getPortalPatient } from "@/lib/patient-session";
import { getProfessional } from "@/lib/professional";

export const dynamic = "force-dynamic";

const cardTitle = "text-subheadline font-semibold text-muted-foreground";

// HU-017d-1 (SDD 4.4 y 5.1): inicio del portal. Fechas y "hoy" en la zona de la profesional (T9f).
export default async function PortalHomePage() {
  const patient = await getPortalPatient();
  if (!patient) return null; // el layout ya cubre este caso

  const now = new Date();
  const pro = await getProfessional();
  const tz = pro.timezone;

  const [nextAppointment, latestPlan, latestWeight, diaryToday] = await Promise.all([
    // D6: el primero por fecha entre confirmados y los que esperan la seña.
    prisma.appointment.findFirst({
      where: { patientId: patient.id, status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] }, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, status: true, priceSnapshot: true, service: { select: { name: true } } },
    }),
    prisma.nutritionPlan.findFirst({
      where: { patientId: patient.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      select: { title: true },
    }),
    prisma.evolutionEntry.findFirst({
      where: { patientId: patient.id, weightKg: { not: null } },
      orderBy: { recordedAt: "desc" },
      select: { weightKg: true, recordedAt: true },
    }),
    prisma.diaryEntry.count({ where: { patientId: patient.id, createdAt: { gte: startOfTodayInTz(now, tz) } } }),
  ]);

  const whatsappUrl = professionalWhatsappUrl(pro.phoneJid);
  const insurances = messages.formatInsuranceList(pro.acceptedInsurances);
  const diaryText = diaryTodayText(diaryToday);
  const planTitle = latestPlan?.title.trim() || PORTAL_TEXT.planTitle;

  return (
    <div className="space-y-4">
      <header className="mb-2">
        <h1 className="text-balance text-large-title">{portalGreeting(patient.name)}</h1>
        <p className="mt-1 text-pretty text-body-lg text-muted-foreground">
          {portalProfessionalLine({ title: pro.title, name: pro.name, licenseNumber: pro.licenseNumber })}
        </p>
      </header>

      {/* Tu próximo turno: la tarjeta destacada; no navega. */}
      <section aria-labelledby="portal-next-appointment" className="rounded-xl bg-card p-6 shadow-card more-contrast:border more-contrast:border-input">
        <h2 id="portal-next-appointment" className="flex items-center gap-1.5 text-subheadline font-semibold text-primary">
          <CalendarDays className="size-4 shrink-0" aria-hidden />
          {PORTAL_TEXT.nextAppointmentLabel}
        </h2>
        {nextAppointment ? (
          <>
            <p className="mt-2 text-title-2 tabular-nums">{formatAppointmentWhen(nextAppointment.startsAt, now, tz)}</p>
            <p className="mt-1 text-body-lg text-muted-foreground">
              {nextAppointment.service.name} · {formatPrice(nextAppointment.priceSnapshot.toString(), pro.currency)}
            </p>
            {nextAppointment.status === "AWAITING_PAYMENT" ? (
              <p className="mt-3 flex items-start gap-1.5 text-callout text-warning">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {PORTAL_TEXT.awaitingDeposit}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-2 text-headline">{PORTAL_TEXT.noAppointmentsTitle}</p>
            <p className="mt-1 text-pretty text-body-lg text-muted-foreground">{PORTAL_TEXT.noAppointmentsBody}</p>
            {whatsappUrl ? (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "tinted", size: "lg" }), "mt-4 w-full")}
              >
                <MessageCircle aria-hidden />
                {PORTAL_TEXT.writeWhatsapp}
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            ) : null}
          </>
        )}
      </section>

      {latestPlan ? (
        <PortalCardLink href="/portal/plan" label={`${PORTAL_TEXT.planTitle}: ${planTitle}`}>
          <p className={cardTitle}>{PORTAL_TEXT.planTitle}</p>
          <p className="mt-1 break-words text-headline">{planTitle}</p>
          <p className="mt-0.5 text-body-lg text-muted-foreground">{PORTAL_TEXT.planHint}</p>
        </PortalCardLink>
      ) : (
        <Card className="p-5">
          <h2 className={cardTitle}>{PORTAL_TEXT.planTitle}</h2>
          <p className="mt-1 text-body-lg text-muted-foreground">{PORTAL_TEXT.noPlan}</p>
        </Card>
      )}

      <Card className="p-5">
        <h2 className={cardTitle}>{PORTAL_TEXT.diaryTitle}</h2>
        <p className="mt-1 text-headline">{PORTAL_TEXT.diaryQuestion}</p>
        {diaryText ? <p className="mt-0.5 text-body-lg text-muted-foreground">{diaryText}</p> : null}
        {/* 017d-2: abre "Anotar comida" directo (?anotar=1). */}
        <ButtonLink href="/portal/diario?anotar=1" size="lg" className="mt-4 w-full">
          <PencilLine aria-hidden />
          {PORTAL_TEXT.addMeal}
        </ButtonLink>
      </Card>

      <PortalCardLink href="/portal/evolucion" label={PORTAL_TEXT.evolutionTitle}>
        <p className={cardTitle}>{PORTAL_TEXT.evolutionTitle}</p>
        {latestWeight?.weightKg != null ? (
          <div className="mt-2">
            {/* D3: sin `trend` (pinta flecha y color). */}
            <Metric
              label={PORTAL_TEXT.lastWeightLabel}
              value={Number(latestWeight.weightKg)}
              unit="kg"
              size="lg"
              caption={formatTimeAgo(latestWeight.recordedAt, now, tz)}
            />
          </div>
        ) : (
          <p className="mt-1 text-pretty text-body-lg text-muted-foreground">{PORTAL_TEXT.noWeightYet}</p>
        )}
      </PortalCardLink>

      {insurances.length > 0 ? (
        <Card className="p-5">
          <h2 className={cardTitle}>{PORTAL_TEXT.insurancesTitle}</h2>
          <ul className="mt-2 space-y-1 text-body-lg">
            {insurances.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="pt-2">
        <PortalLogoutButton />
      </div>
    </div>
  );
}
