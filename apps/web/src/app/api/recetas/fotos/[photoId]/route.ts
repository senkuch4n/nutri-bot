import { NextResponse } from "next/server";
import { recipesForTenant } from "@nutri-bot/db/domain";
import { resolvePrivateContentAccess } from "@/lib/private-content-access";

// HU-018a: el panel verifica pertenencia y propiedad para cada lectura, incluso al cambiar de sesión.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request, { params }: { params: Promise<{ photoId: string }> }): Promise<Response> {
  const access = await resolvePrivateContentAccess();
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const { photoId } = await params;
  const size = new URL(req.url).searchParams.get("size") === "full" ? "full" : "thumb";
  const photo = await recipesForTenant(access.tenantId).getPhotoBytes(photoId, size);
  if (!photo) return NextResponse.json({ error: "no encontrada" }, { status: 404, headers: NO_STORE });

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": "image/webp",
      ...NO_STORE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
