import { NextResponse } from "next/server";
import { getAnthropometricReportPdf, getConsultation, getIsakStudy } from "@nutri-bot/db/domain";
import { getTenantContext } from "@/lib/tenant-context";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** HU-007: último PDF del informe antropométrico de la consulta. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; consultationId: string }> },
) {
  // HU-025: informe del consultorio de la sesión; una consulta de otro consultorio → 404 como inexistente.
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const { id, consultationId } = await params;
  const consultation = await getConsultation(ctx, consultationId);
  if (!consultation || consultation.patientId !== id) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404, headers: NO_STORE });
  }
  const entry = await getIsakStudy(ctx, consultationId);
  const pdf = entry ? await getAnthropometricReportPdf(ctx, entry.id) : null;
  if (!pdf) return NextResponse.json({ error: "sin PDF" }, { status: 404, headers: NO_STORE });

  return new NextResponse(new Uint8Array(pdf.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
