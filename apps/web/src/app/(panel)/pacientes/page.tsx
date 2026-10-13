import { prisma } from "@nutri-bot/db";
import { PATIENT_DIRECTORY_TEXT, buildPatientDirectory, type PatientDirectoryInput } from "@nutri-bot/core";
import { PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { PatientDirectory } from "./patient-directory";

export const dynamic = "force-dynamic";

export default async function PacientesPage() {
  const now = new Date();
  const [pro, patients, conversations] = await Promise.all([
    getProfessional(),
    // Sin orderBy: el orden (alfabético es-AR y "Por completar") lo arma core.
    prisma.patient.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        whatsappJid: true,
        createdAt: true,
        appointments: {
          where: { status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] }, startsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          take: 1,
          select: { startsAt: true, status: true },
        },
        consultations: { orderBy: { consultedAt: "desc" }, take: 1, select: { consultedAt: true } },
      },
    }),
    prisma.conversationState.findMany({ select: { patientJid: true, updatedAt: true } }),
  ]);

  const lastContactByJid = new Map(conversations.map((c) => [c.patientJid, c.updatedAt]));
  const inputs: PatientDirectoryInput[] = patients.map((p) => {
    const next = p.appointments[0];
    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      whatsappJid: p.whatsappJid,
      createdAt: p.createdAt,
      nextAppointment:
        next && (next.status === "CONFIRMED" || next.status === "AWAITING_PAYMENT")
          ? { startsAt: next.startsAt, status: next.status }
          : null,
      lastConsultationAt: p.consultations[0]?.consultedAt ?? null,
      lastContactAt: lastContactByJid.get(p.whatsappJid) ?? null,
    };
  });
  const { named, unnamed } = buildPatientDirectory(inputs, now, pro.timezone);

  return (
    <div>
      <PageHeader title={PATIENT_DIRECTORY_TEXT.title} />
      <PatientDirectory named={named} unnamed={unnamed} />
    </div>
  );
}
