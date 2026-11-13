import { NextResponse } from "next/server";
import { prisma } from "@nutri-bot/db";
import { appointmentEventTitle, isConsultationEmpty, patientDisplayName } from "@nutri-bot/core";
import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  // FullCalendar envía `start` / `end`; aceptamos también `from` / `to`.
  const from = new Date(searchParams.get("start") ?? searchParams.get("from") ?? "");
  const to = new Date(searchParams.get("end") ?? searchParams.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "rango inválido" }, { status: 400 });
  }

  const appts = await prisma.appointment.findMany({
    where: {
      startsAt: { gte: from, lt: to },
      status: { in: ["CONFIRMED", "COMPLETED", "NO_SHOW"] },
    },
    include: {
      patient: true,
      service: true,
      // HU-017b-1 (D9): "Registrar pago" se ofrece si el turno todavía no tiene un pago total aprobado.
      payments: { where: { kind: "FULL", status: "APPROVED" }, select: { id: true }, take: 1 },
      consultation: {
        select: {
          id: true,
          notes: true,
          planId: true,
          prescription: { select: { id: true } },
          _count: { select: { evolutionEntries: true } },
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  // Estados cerrados con los tokens del sistema (FullCalendar los pone inline y var() se resuelve en :root).
  const statusColor: Record<string, string> = {
    COMPLETED: "hsl(var(--success))",
    NO_SHOW: "hsl(var(--destructive))",
  };

  const events = appts.map((a) => ({
    id: a.id,
    title: appointmentEventTitle(a.patient, a.service.name),
    start: a.startsAt.toISOString(),
    end: a.endsAt.toISOString(),
    backgroundColor: statusColor[a.status] ?? a.service.color,
    borderColor: statusColor[a.status] ?? a.service.color,
    extendedProps: {
      status: a.status,
      patientName: a.patient.name,
      patientPhone: a.patient.phone,
      patientJid: a.patient.whatsappJid,
      patientLabel: patientDisplayName(a.patient),
      hasFullPayment: a.payments.length > 0,
      serviceName: a.service.name,
      price: a.priceSnapshot.toString(),
      googleSynced: Boolean(a.googleEventId),
      patientId: a.patientId,
      reason: a.reason,
      consultation: a.consultation
        ? {
            id: a.consultation.id,
            hasContent: !isConsultationEmpty({
              measurementCount: a.consultation._count.evolutionEntries,
              hasPrescription: a.consultation.prescription !== null,
              hasPlan: a.consultation.planId !== null,
              notes: a.consultation.notes,
            }),
          }
        : null,
    },
  }));

  return NextResponse.json(events);
}
