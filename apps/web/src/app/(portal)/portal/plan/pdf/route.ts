import { NextResponse } from "next/server";
import { prisma } from "@nutri-bot/db";
import { getPortalPatient } from "@/lib/patient-session";

export async function GET() {
  const patient = await getPortalPatient();
  if (!patient) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const plan = await prisma.nutritionPlan.findFirst({
    where: { patientId: patient.id, status: "ACTIVE" },
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
