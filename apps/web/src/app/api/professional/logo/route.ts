import { NextResponse } from "next/server";
import { prisma } from "@nutri-bot/db";
import { tenantProfessionalWhere } from "@/lib/tenant-professional";
import { getTenantContext } from "@/lib/tenant-context";

// HU-025: logo de la profesional del consultorio del contexto. Sin contexto → 401.
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const pro = await prisma.professional.findUnique({
    where: tenantProfessionalWhere(ctx),
    select: { logoData: true, logoMimeType: true },
  });
  if (!pro?.logoData || !pro.logoMimeType) {
    return NextResponse.json({ error: "sin logo" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return new NextResponse(new Uint8Array(pro.logoData), {
    headers: {
      "Content-Type": pro.logoMimeType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
