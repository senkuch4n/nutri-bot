import { prisma } from "@nutri-bot/db";
import { PageHeader } from "@/components/ui";
import { PatientsList } from "./patients-list";

export const dynamic = "force-dynamic";

export default async function PacientesPage() {
  const patients = await prisma.patient.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    include: {
      _count: {
        select: {
          appointments: { where: { status: "CONFIRMED", startsAt: { gte: new Date() } } },
        },
      },
    },
  });

  return (
    <div>
      <PageHeader
        title="Pacientes"
        description="Personas que escribieron al bot o tienen turnos cargados."
      />
      <PatientsList
        patients={patients.map((p) => ({
          id: p.id,
          name: p.name,
          phone: p.phone,
          upcoming: p._count.appointments,
        }))}
      />
    </div>
  );
}
