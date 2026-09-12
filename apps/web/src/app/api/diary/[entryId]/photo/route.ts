import { NextResponse } from "next/server";
import { prisma } from "@nutri-bot/db";
import { auth } from "@/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ entryId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { entryId } = await params;
  const entry = await prisma.diaryEntry.findUnique({
    where: { id: entryId },
    select: { photoData: true, photoMimeType: true },
  });
  if (!entry?.photoData || !entry.photoMimeType) {
    return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(entry.photoData), {
    headers: { "Content-Type": entry.photoMimeType, "Cache-Control": "private, max-age=3600" },
  });
}
