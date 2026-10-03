import { NextResponse } from "next/server";
import { getProfessionalSignatureImage } from "@nutri-bot/db/domain";
import { auth } from "@/auth";

// HU-016 (D10): vista previa de la firma, SOLO para el panel. El middleware de Auth.js ya redirige
// sin sesión; el auth() de acá es la segunda barrera (401). Nunca se cachea ni se loguea.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const img = await getProfessionalSignatureImage();
  if (!img) return NextResponse.json({ error: "sin firma" }, { status: 404, headers: NO_STORE });

  return new NextResponse(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
