import Link from "next/link";
import { prisma } from "@nutri-bot/db";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PacientesPage() {
  const patients = await prisma.patient.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { appointments: { where: { status: "CONFIRMED", startsAt: { gte: new Date() } } } },
      },
    },
  });

  return (
    <div>
      <PageHeader title="Pacientes" description="Personas que escribieron al bot o tienen turnos." />
      <Card>
        {patients.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay pacientes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pb-2 font-medium">Nombre</th>
                <th className="pb-2 font-medium">Teléfono</th>
                <th className="pb-2 font-medium">Turnos próximos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((p) => (
                <tr key={p.id}>
                  <td className="py-2">
                    <Link href={`/pacientes/${p.id}`} className="font-medium text-brand hover:underline">
                      {p.name ?? "(sin nombre)"}
                    </Link>
                  </td>
                  <td className="py-2 text-slate-600">{p.phone}</td>
                  <td className="py-2 text-slate-600">{p._count.appointments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
