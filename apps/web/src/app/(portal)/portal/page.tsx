import { ChevronRight } from "lucide-react";
import { prisma } from "@nutri-bot/db";
import { formatDateTime, formatPrice, messages } from "@nutri-bot/core";
import { Badge, ButtonLink, Card, Quantity } from "@/components/ui";
import { getPortalPatient } from "@/lib/patient-session";
import { getProfessional } from "@/lib/professional";

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  const patient = await getPortalPatient();
  if (!patient) return null; // el layout ya cubre este caso

  const [pro, nextAppointment, latestPlan, latestEntry] = await Promise.all([
    getProfessional(),
    prisma.appointment.findFirst({
      where: { patientId: patient.id, status: "CONFIRMED", startsAt: { gte: new Date() } },
      include: { service: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.nutritionPlan.findFirst({
      where: { patientId: patient.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.evolutionEntry.findFirst({
      where: { patientId: patient.id, weightKg: { not: null } },
      orderBy: { recordedAt: "desc" },
    }),
  ]);

  const insurances = messages.formatInsuranceList(pro.acceptedInsurances);
  const cardLink = "mt-4 w-full sm:w-auto";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-balance text-2xl font-semibold tracking-tight">
          Hola{patient.name ? `, ${patient.name}` : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Este es tu espacio con {pro.name}.</p>
      </header>

      <div className="space-y-4">
        <Card title="Tu próximo turno">
          {nextAppointment ? (
            <div>
              <p className="text-base font-medium first-letter:uppercase">
                {formatDateTime(nextAppointment.startsAt, pro.timezone)} hs
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {nextAppointment.service.name} ·{" "}
                {formatPrice(nextAppointment.priceSnapshot.toString(), pro.currency)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No tenés turnos próximos. Escribile a tu nutricionista por WhatsApp para sacar uno.
            </p>
          )}
        </Card>

        <Card title="Tu plan vigente">
          {latestPlan ? (
            <div>
              <p className="text-sm font-medium">{latestPlan.title}</p>
              <ButtonLink href="/portal/plan" variant="secondary" size="lg" className={cardLink}>
                Ver plan
                <ChevronRight aria-hidden />
              </ButtonLink>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no tenés un plan activo.</p>
          )}
        </Card>

        <Card title="Tu evolución">
          {latestEntry?.weightKg ? (
            <div>
              <p className="text-sm text-muted-foreground">Último peso registrado</p>
              <Quantity
                value={Number(latestEntry.weightKg)}
                unit="kg"
                className="mt-1 block text-2xl font-semibold"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no hay registros.</p>
          )}
          <ButtonLink href="/portal/evolucion" variant="secondary" size="lg" className={cardLink}>
            Ver evolución
            <ChevronRight aria-hidden />
          </ButtonLink>
        </Card>

        <Card title="Diario alimentario">
          <p className="text-sm text-muted-foreground">Anotá lo que comiste hoy, con foto si querés.</p>
          <ButtonLink href="/portal/diario" variant="secondary" size="lg" className={cardLink}>
            Abrir diario
            <ChevronRight aria-hidden />
          </ButtonLink>
        </Card>

        {insurances.length > 0 ? (
          <Card title="Obras sociales">
            <ul className="flex flex-wrap gap-2">
              {insurances.map((i) => (
                <li key={i}>
                  <Badge tone="neutral">{i}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
