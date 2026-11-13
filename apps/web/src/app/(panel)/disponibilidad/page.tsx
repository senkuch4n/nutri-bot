import { prisma } from "@nutri-bot/db";
import { dayKeyInTz } from "@nutri-bot/core";
import { getProfessional } from "@/lib/professional";
import { DisponibilidadView } from "./view";

export const dynamic = "force-dynamic";

export default async function DisponibilidadPage() {
  const pro = await getProfessional();
  const [rules, exceptions] = await Promise.all([
    // HU-017b-2 (Q16): solo las reglas activas, igual que el bot y el calendario. Las inactivas (cargas
    // viejas) no se muestran ni se tocan.
    prisma.availabilityRule.findMany({
      where: { active: true },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      select: { id: true, weekday: true, startTime: true, endTime: true },
    }),
    prisma.availabilityException.findMany({ orderBy: { date: "asc" } }),
  ]);

  // Solo datos planos al cliente (T9a): nada de funciones ni componentes.
  return (
    <DisponibilidadView
      todayKey={dayKeyInTz(new Date(), pro.timezone)}
      rules={rules}
      exceptions={exceptions.map((e) => ({
        id: e.id,
        // `date` es un día calendario guardado a medianoche UTC.
        dayKey: e.date.toISOString().slice(0, 10),
        type: e.type,
        startTime: e.startTime,
        endTime: e.endTime,
        reason: e.reason,
      }))}
    />
  );
}
