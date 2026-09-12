import Link from "next/link";
import { prisma } from "@nutri-bot/db";
import { formatDateTime, formatPrice } from "@nutri-bot/core";
import { Badge, Card, SectionLabel } from "@/components/ui";
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
      where: { patientId: patient.id },
      orderBy: { recordedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          Hola{patient.name ? `, ${patient.name}` : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-ink-soft">Este es tu espacio con {pro.name}.</p>
      </div>

      <Card>
        <SectionLabel>Tu próximo turno</SectionLabel>
        {nextAppointment ? (
          <div>
            <p className="text-sm font-medium text-ink">
              {nextAppointment.service.name}
              <span className="mx-1.5 text-ink-faint">·</span>
              {formatDateTime(nextAppointment.startsAt, pro.timezone)} hs
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {formatPrice(nextAppointment.priceSnapshot.toString(), pro.currency)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-ink-faint">
            No tenés turnos próximos. Escribile a tu nutricionista por WhatsApp para sacar uno.
          </p>
        )}
      </Card>

      <Card>
        <SectionLabel>Tu plan vigente</SectionLabel>
        {latestPlan ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-ink">{latestPlan.title}</p>
            <Link href="/portal/plan" className="text-sm font-semibold text-leaf-deep hover:underline">
              Ver plan →
            </Link>
          </div>
        ) : (
          <p className="text-sm text-ink-faint">Todavía no tenés un plan activo.</p>
        )}
      </Card>

      <Card>
        <SectionLabel>Tu evolución</SectionLabel>
        <div className="flex items-center justify-between gap-4">
          <div>
            {latestEntry?.weightKg ? (
              <p className="text-sm text-ink-soft">
                Último peso registrado: <Badge tone="green">{latestEntry.weightKg.toString()} kg</Badge>
              </p>
            ) : (
              <p className="text-sm text-ink-faint">Todavía no hay registros.</p>
            )}
          </div>
          <Link href="/portal/evolucion" className="text-sm font-semibold text-leaf-deep hover:underline">
            Ver evolución →
          </Link>
        </div>
      </Card>

      <Card>
        <SectionLabel>Diario alimentario</SectionLabel>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-ink-soft">Anotá lo que comiste hoy, con foto si querés.</p>
          <Link href="/portal/diario" className="text-sm font-semibold text-leaf-deep hover:underline">
            Abrir diario →
          </Link>
        </div>
      </Card>
    </div>
  );
}
