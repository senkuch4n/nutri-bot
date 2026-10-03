import { NextResponse } from "next/server";
import { getRecipePhotoBytes, patientCanSeeRecipePhoto } from "@nutri-bot/db/domain";
import { getPortalPatient } from "@/lib/patient-session";

// HU-018a (D3/D19): foto de receta para el portal. Vive bajo /portal porque la cookie del paciente
// tiene path "/portal". Solo si el paciente tiene un plan ACTIVO con esa receta; si no, 404 sin
// distinguir "no existe" de "no autorizado". No es inmutable: el permiso cambia al archivar el plan.
// La UI que la usa llega en 018c.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request, { params }: { params: Promise<{ photoId: string }> }): Promise<Response> {
  const patient = await getPortalPatient();
  if (!patient) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const { photoId } = await params;
  const allowed = await patientCanSeeRecipePhoto(patient.id, photoId);
  const size = new URL(req.url).searchParams.get("size") === "full" ? "full" : "thumb";
  const photo = allowed ? await getRecipePhotoBytes(photoId, size) : null;
  if (!photo) return NextResponse.json({ error: "no encontrada" }, { status: 404, headers: NO_STORE });

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
