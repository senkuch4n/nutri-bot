import { NextResponse } from "next/server";
import { prisma } from "@nutri-bot/db";
import { getPortalSession } from "@/lib/patient-session";

// HU-033 (025c): el plan ACTIVE del paciente de la sesión, en el consultorio de la sesión.
export async function GET() {
  const session = await getPortalSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const plan = await prisma.nutritionPlan.findFirst({
    where: { patientId: session.patient.id, tenantId: session.tenantId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: { pdfData: true, pdfFileName: true },
  });
  if (!plan?.pdfData) return NextResponse.json({ error: "sin PDF" }, { status: 404 });

  return new NextResponse(new Uint8Array(plan.pdfData), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${plan.pdfFileName ?? "plan.pdf"}"`,
    },
  });
}
