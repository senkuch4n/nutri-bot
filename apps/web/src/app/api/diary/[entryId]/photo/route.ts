import { NextResponse } from "next/server";
import { prisma } from "@nutri-bot/db";
import { getTenantContext } from "@/lib/tenant-context";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Foto del diario para el panel. HU-025: solo entradas de pacientes del consultorio de la sesión;
 *  una de otro consultorio responde 404 igual que una inexistente. */
export async function GET(_req: Request, { params }: { params: Promise<{ entryId: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const { entryId } = await params;
  const entry = await prisma.diaryEntry.findFirst({
    where: { id: entryId, patient: { tenantId: ctx.tenantId } },
    select: { photoData: true, photoMimeType: true },
  });
  if (!entry?.photoData || !entry.photoMimeType) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404, headers: NO_STORE });
  }

  return new NextResponse(new Uint8Array(entry.photoData), {
    headers: { "Content-Type": entry.photoMimeType, ...NO_STORE },
  });
}
