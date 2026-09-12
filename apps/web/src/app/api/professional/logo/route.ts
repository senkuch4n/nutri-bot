import { NextResponse } from "next/server";
import { prisma } from "@nutri-bot/db";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pro = await prisma.professional.findUnique({
    where: { id: 1 },
    select: { logoData: true, logoMimeType: true },
  });
  if (!pro?.logoData || !pro.logoMimeType) {
    return NextResponse.json({ error: "sin logo" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(pro.logoData), {
    headers: {
      "Content-Type": pro.logoMimeType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
