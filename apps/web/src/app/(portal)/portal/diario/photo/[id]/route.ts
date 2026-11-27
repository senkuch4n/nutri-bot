import { NextResponse } from "next/server";
import { prisma } from "@nutri-bot/db";
import { getPortalSession } from "@/lib/patient-session";

// HU-033 (025c): la entrada tiene que ser del paciente de la sesión y de su consultorio. Un id de otro
// paciente o de otro consultorio responde igual que uno inexistente.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await prisma.diaryEntry.findFirst({
    where: { id, patientId: session.patient.id, patient: { tenantId: session.tenantId } },
    select: { photoData: true, photoMimeType: true },
  });
  if (!entry?.photoData || !entry.photoMimeType) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(entry.photoData), {
    headers: { "Content-Type": entry.photoMimeType, "Cache-Control": "private, max-age=3600" },
  });
}
