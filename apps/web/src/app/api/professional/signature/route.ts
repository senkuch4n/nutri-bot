import { NextResponse } from "next/server";
import { getProfessionalSignatureImage } from "@nutri-bot/db/domain";
import { getTenantContext } from "@/lib/tenant-context";

// HU-016 (D10): vista previa de la firma, SOLO para el panel. El middleware ya corta sin acceso; el
// contexto de acá es la segunda barrera (401). HU-025: la firma es la de la profesional del consultorio
// del contexto (025d la veda en modo soporte). Nunca se cachea ni se loguea.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const img = await getProfessionalSignatureImage(ctx);
  if (!img) return NextResponse.json({ error: "sin firma" }, { status: 404, headers: NO_STORE });

  return new NextResponse(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
