import { NextResponse } from "next/server";
import { getAnthropometricReportPdf, getConsultation, getIsakStudy } from "@nutri-bot/db/domain";
import { auth } from "@/auth";

/** HU-007: último PDF del informe antropométrico de la consulta. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; consultationId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, consultationId } = await params;
  const consultation = await getConsultation(consultationId);
  if (!consultation || consultation.patientId !== id) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  }
  const entry = await getIsakStudy(consultationId);
  const pdf = entry ? await getAnthropometricReportPdf(entry.id) : null;
  if (!pdf) return NextResponse.json({ error: "sin PDF" }, { status: 404 });

  return new NextResponse(new Uint8Array(pdf.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
