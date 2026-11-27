import { prisma } from "@nutri-bot/db";
import { groupDiaryByDay } from "@nutri-bot/core";
import { DiaryScreen, type DiaryGroupRow } from "@/components/portal/diary-screen";
import { getPortalSession } from "@/lib/patient-session";
import { getTenantProfessional } from "@/lib/professional";

export const dynamic = "force-dynamic";

// HU-017d-2 (SDD 4.2): la lista va sin los bytes de las fotos (Q6); "Hoy", "Ayer" y la hora se calculan
// acá con la zona de la profesional (T9f). Al cliente le llegan solo datos planos (T9a).
export default async function PortalDiaryPage({ searchParams }: { searchParams: Promise<{ anotar?: string }> }) {
  const session = await getPortalSession();
  if (!session) return null;
  // HU-033 (025c): entradas del paciente de la sesión y de su consultorio.
  const { patient, tenantId } = session;

  const [pro, rows, params] = await Promise.all([
    getTenantProfessional(tenantId),
    prisma.diaryEntry.findMany({
      where: { patientId: patient.id, patient: { tenantId } },
      orderBy: { createdAt: "desc" },
      select: { id: true, note: true, createdAt: true, photoMimeType: true },
    }),
    searchParams,
  ]);

  const groups: DiaryGroupRow[] = groupDiaryByDay(rows, new Date(), pro.timezone).map((g) => ({
    dayKey: g.dayKey,
    label: g.label,
    entries: g.entries.map((e) => ({
      id: e.id,
      note: e.note,
      hasPhoto: e.photoMimeType !== null,
      timeLabel: e.timeLabel,
    })),
  }));

  return <DiaryScreen groups={groups} openOnMount={params.anotar === "1"} />;
}
