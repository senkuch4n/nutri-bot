import { NextResponse } from "next/server";
import { prisma } from "@nutri-bot/db";
import { appointmentEventTitle, isConsultationEmpty, patientDisplayName } from "@nutri-bot/core";
import { getTenantContext } from "@/lib/tenant-context";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  // HU-025: agenda principal del consultorio de la sesión; nada de la query elige el tenant.
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const { searchParams } = new URL(req.url);
  // FullCalendar envía `start` / `end`; aceptamos también `from` / `to`.
  const from = new Date(searchParams.get("start") ?? searchParams.get("from") ?? "");
  const to = new Date(searchParams.get("end") ?? searchParams.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "rango inválido" }, { status: 400 });
  }

  const scope = { tenantId: ctx.tenantId, agendaId: ctx.agendaId };
  const appts = await prisma.appointment.findMany({
    where: {
      ...scope,
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

  // La pastilla se pinta por estado (clase appt-event--<estado>, globals.css); el color del servicio va
  // como dato y lo lleva el punto de la pastilla.
  const events = appts.map((a) => ({
    id: a.id,
    title: appointmentEventTitle(a.patient, a.service.name),
    start: a.startsAt.toISOString(),
    end: a.endsAt.toISOString(),
    extendedProps: {
      status: a.status,
      patientName: a.patient.name,
      patientPhone: a.patient.phone,
      patientJid: a.patient.whatsappJid,
      patientLabel: patientDisplayName(a.patient),
      hasFullPayment: a.payments.length > 0,
      serviceName: a.service.name,
      serviceColor: a.service.color,
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

  return NextResponse.json(events, { headers: NO_STORE });
}
