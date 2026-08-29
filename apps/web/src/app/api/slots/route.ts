import { NextResponse } from "next/server";
import { fromZonedTime } from "@nutri-bot/core";
import { auth } from "@/auth";
import { getProfessional } from "@/lib/professional";
import { getAvailableSlotsForService } from "@/lib/availability";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const date = searchParams.get("date"); // "yyyy-MM-dd" en la zona de la profesional
  if (!serviceId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "parámetros inválidos" }, { status: 400 });
  }

  const pro = await getProfessional();
  const from = fromZonedTime(`${date}T00:00:00`, pro.timezone);
  const to = fromZonedTime(`${date}T23:59:59`, pro.timezone);

  const slots = await getAvailableSlotsForService({ serviceId, from, to });
  return NextResponse.json(slots.map((s) => s.toISOString()));
}
