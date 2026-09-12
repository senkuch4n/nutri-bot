import { NextResponse } from "next/server";
import { prisma } from "@nutri-bot/db";
import { getPortalPatient } from "@/lib/patient-session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const patient = await getPortalPatient();
  if (!patient) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await prisma.diaryEntry.findUnique({
    where: { id },
    select: { patientId: true, photoData: true, photoMimeType: true },
  });
  if (!entry || entry.patientId !== patient.id || !entry.photoData || !entry.photoMimeType) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(entry.photoData), {
    headers: { "Content-Type": entry.photoMimeType, "Cache-Control": "private, max-age=3600" },
  });
}
