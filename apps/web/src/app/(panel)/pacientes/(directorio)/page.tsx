import { prisma } from "@nutri-bot/db";
import {
  PATIENT_ARCHIVE_TEXT,
  buildArchivedPatientList,
  buildPatientDirectory,
  type PatientDirectoryInput,
} from "@nutri-bot/core";
import { PageHeader } from "@/components/ui";
import { getProfessional } from "@/lib/professional";
import { ArchivedPatientList } from "../archived-patient-list";
import { NewPatientSheet } from "../new-patient-sheet";
import { PatientDirectory } from "../patient-directory";

export const dynamic = "force-dynamic";

// HU-019 (T14): la vista de archivadas es la misma ruta con `?vista=archivadas`.
const ARCHIVED_SELECT = { id: true, name: true, phone: true, whatsappJid: true, archivedAt: true } as const;

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string | string[] }>;
}) {
  const { vista } = await searchParams;
  if (vista === "archivadas") return <ArchivedView />;

  const now = new Date();
  const [pro, patients, conversations, archived] = await Promise.all([
    getProfessional(),
    // Sin orderBy: el orden (alfabético es-AR y "Por completar") lo arma core.
    prisma.patient.findMany({
      // HU-019 (T8): solo activas; core además descarta archivadas.
      where: { archivedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        whatsappJid: true,
        createdAt: true,
        archivedAt: true,
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
    prisma.patient.findMany({ where: { archivedAt: { not: null } }, select: ARCHIVED_SELECT }),
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
      archivedAt: p.archivedAt,
    };
  });
  const { named, unnamed } = buildPatientDirectory(inputs, now, pro.timezone);
  // El contador cuenta las mismas filas que muestra la vista (sin canales ni grupos).
  const archivedCount = buildArchivedPatientList(archivedInputs(archived), pro.timezone).length;

  return (
    <PatientDirectory
      named={named}
      unnamed={unnamed}
      archivedCount={archivedCount}
      newPatient={<NewPatientSheet />}
    />
  );
}

type ArchivedSelect = { id: string; name: string | null; phone: string; whatsappJid: string; archivedAt: Date | null };

function archivedInputs(rows: ArchivedSelect[]) {
  return rows.flatMap((p) => (p.archivedAt ? [{ ...p, archivedAt: p.archivedAt }] : []));
}

/** HU-019 (D2, SDD 7.4): `/pacientes?vista=archivadas`. Sin "Nuevo paciente". */
async function ArchivedView() {
  const [pro, archived] = await Promise.all([
    getProfessional(),
    prisma.patient.findMany({ where: { archivedAt: { not: null } }, select: ARCHIVED_SELECT }),
  ]);
  const rows = buildArchivedPatientList(archivedInputs(archived), pro.timezone);
  return (
    <div>
      <PageHeader
        title={PATIENT_ARCHIVE_TEXT.archivedTitle}
        back={{ href: "/pacientes", label: PATIENT_ARCHIVE_TEXT.backToPatients }}
      />
      <ArchivedPatientList rows={rows} />
    </div>
  );
}
