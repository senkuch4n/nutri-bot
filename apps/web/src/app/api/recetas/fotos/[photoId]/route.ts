import { NextResponse } from "next/server";
import { getRecipePhotoBytes } from "@nutri-bot/db/domain";
import { auth } from "@/auth";

// HU-018a: foto de una receta para el panel. El id cambia cada vez que se reemplaza la foto, así
// que la respuesta se puede cachear como inmutable (privada: requiere sesión).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request, { params }: { params: Promise<{ photoId: string }> }): Promise<Response> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const { photoId } = await params;
  const size = new URL(req.url).searchParams.get("size") === "full" ? "full" : "thumb";
  const photo = await getRecipePhotoBytes(photoId, size);
  if (!photo) return NextResponse.json({ error: "no encontrada" }, { status: 404, headers: NO_STORE });

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
