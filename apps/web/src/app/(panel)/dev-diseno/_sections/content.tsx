import { Inbox, Pencil } from "lucide-react";
import { AdequacyBar, Alert, Badge, Button, Card, EmptyState, Metric, PageHeader, Quantity, SectionLabel, StatTile } from "@/components/ui";
import { DemoLabel, DemoSection } from "./section";

export function ContentSection() {
  return (
    <DemoSection
      id="contenido"
      index={9}
      title="Contenido"
      description="Tarjetas sin borde, títulos con peso en vez de tamaño, números grandes con tamaño óptico."
    >
      <div className="space-y-8">
        <div className="rounded-xl bg-grouped p-6">
          <PageHeader
            title="María López"
            description="34 años · Control mensual · Próximo turno: jueves 9 de octubre, 10:30"
            back={{ href: "#contenido", label: "Pacientes" }}
            action={
              <Button variant="tinted">
                <Pencil aria-hidden />
                Editar
              </Button>
            }
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Datos para cálculos" description="Se usan en el requerimiento energético.">
              <p className="text-body">Actividad moderada · 3 entrenamientos por semana.</p>
            </Card>
            <Card>
              <SectionLabel>Sin encabezado</SectionLabel>
              <p className="text-body text-muted-foreground">Card con padding md y contenido libre.</p>
            </Card>
            <Card title="padding=&quot;none&quot;" padding="none" actions={<Button size="sm" variant="secondary">Ver todo</Button>}>
              <ul>
                {["Primera consulta", "Control mensual", "Antropometría ISAK"].map((s) => (
                  <li key={s} className="border-b border-border px-6 py-3 text-callout last:border-0">
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        <div>
          <DemoLabel>Métricas</DemoLabel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <Metric label="Peso" value={61.2} unit="kg" size="lg" trend={{ delta: -1.4, unit: "kg", sentiment: "positive" }} />
            </Card>
            <Card>
              <Metric label="Grasa corporal" value={27.8} unit="%" trend={{ delta: 1.2, unit: "%", sentiment: "negative" }} />
            </Card>
            <Card>
              <Metric label="Masa muscular" value={24.5} unit="kg" trend={{ delta: 0, unit: "kg", sentiment: "neutral" }} />
            </Card>
            <Card>
              <Metric label="Agua corporal" value={null} unit="%" />
            </Card>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatTile label="Cobrado en octubre" value="$ 412.000" />
            <StatTile label="Pendiente" value="$ 36.000" />
            <StatTile label="Turnos esta semana" value={18} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <DemoLabel>Badge</DemoLabel>
            <div className="flex flex-wrap gap-2">
              <Badge>Neutro</Badge>
              <Badge tone="success">Acreditado</Badge>
              <Badge tone="warning">Seña pendiente</Badge>
              <Badge tone="danger">Vencido</Badge>
              <Badge tone="info">Nuevo</Badge>
            </div>
            <DemoLabel>Quantity</DemoLabel>
            <p className="text-body">
              <Quantity value={1842.5} unit="kcal" /> · <Quantity value={61.2} unit="kg" /> · <Quantity value={null} unit="kg" />
            </p>
            <DemoLabel>AdequacyBar</DemoLabel>
            <div className="space-y-4 rounded-xl bg-card p-5 shadow-card">
              <AdequacyBar label="Proteínas" value={62} target={90} unit="g" status="low" decimals={0} />
              <AdequacyBar label="Energía" value={1820} target={1850} unit="kcal" status="ok" decimals={0} />
              <AdequacyBar label="Sodio" value={2900} target={2300} unit="mg" status="high" decimals={0} />
            </div>
          </div>
          <div className="space-y-4">
            <DemoLabel>Alert</DemoLabel>
            <Alert tone="info" title="Informe listo">
              El informe antropométrico se puede descargar en PDF.
            </Alert>
            <Alert tone="success" title="Pago acreditado">
              Mercado Pago confirmó la seña de $ 12.000.
            </Alert>
            <Alert tone="warning" title="Falta tu matrícula">
              Completala en Ajustes para que aparezca en tus PDF.
            </Alert>
            <Alert tone="danger" title="No se pudo guardar">
              Revisá la conexión y probá de nuevo.
            </Alert>
            <DemoLabel>EmptyState</DemoLabel>
            <div className="rounded-xl bg-card shadow-card">
              <EmptyState
                icon={Inbox}
                title="No hay mensajes pendientes"
                description="Cuando un paciente escriba por la opción 0 del bot, la consulta aparece acá."
                action={<Button variant="tinted">Ver respondidos</Button>}
              />
            </div>
          </div>
        </div>
      </div>
    </DemoSection>
  );
}
