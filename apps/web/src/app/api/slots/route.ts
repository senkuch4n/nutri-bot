import { NextResponse } from "next/server";
import { fromZonedTime } from "@nutri-bot/core";
import { getTenantProfessional } from "@nutri-bot/db/domain";
import { getAvailableSlotsForService } from "@/lib/availability";
import { getTenantContext } from "@/lib/tenant-context";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  // HU-025: slots de la agenda principal del consultorio de la sesión. Un serviceId de otro
  // consultorio da [] (igual que uno inexistente).
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const date = searchParams.get("date"); // "yyyy-MM-dd" en la zona de la profesional
  if (!serviceId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "parámetros inválidos" }, { status: 400, headers: NO_STORE });
  }

  const pro = await getTenantProfessional(ctx.tenantId);
  const from = fromZonedTime(`${date}T00:00:00`, pro.timezone);
  const to = fromZonedTime(`${date}T23:59:59`, pro.timezone);

  const slots = await getAvailableSlotsForService(ctx, { serviceId, from, to });
  return NextResponse.json(slots.map((s) => s.toISOString()), { headers: NO_STORE });
}
