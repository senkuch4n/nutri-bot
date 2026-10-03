import { NextResponse } from "next/server";
import { getImportImageBytes } from "@nutri-bot/db/domain";
import { auth } from "@/auth";

// HU-018a-2: imágenes de la carga asistida (página renderizada y fotos candidatas) para la pantalla
// de revisión. Son datos de terceros que viven solo en la base (D3): requieren sesión del panel.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request, { params }: { params: Promise<{ imageId: string }> }): Promise<Response> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const { imageId } = await params;
  const size = new URL(req.url).searchParams.get("size") === "full" ? "full" : "thumb";
  const image = await getImportImageBytes(imageId, size);
  if (!image) return NextResponse.json({ error: "no encontrada" }, { status: 404, headers: NO_STORE });

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": "image/webp",
      // Se borran al publicar: caché corta.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
