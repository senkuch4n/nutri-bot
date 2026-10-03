"use client";

import { useState } from "react";
import { CircleAlert, SearchX } from "lucide-react";
import { CardSkeleton, PageSkeleton, TableSkeleton } from "@/components/skeletons";
import { StatusScreen } from "@/components/status-screen";
import { Button, Card, Metric } from "@/components/ui";
import { DemoLabel, DemoSection } from "./section";

export function StatesSection() {
  const [loading, setLoading] = useState(true);

  return (
    <DemoSection
      id="estados"
      index={12}
      title="Estados"
      description="Skeletons grises (no teñidos) y pantallas de error y 404. El contenido real entra con un fundido de 150 ms."
    >
      <div className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl bg-card shadow-card">
            <StatusScreen
              icon={CircleAlert}
              title="Algo salió mal"
              description="No pudimos mostrar esta pantalla. Probá de nuevo y, si sigue fallando, recargá la página."
              actions={<Button>Reintentar</Button>}
              detail="Código: 3f9c2a"
            />
          </div>
          <div className="rounded-xl bg-card shadow-card">
            <StatusScreen
              icon={SearchX}
              title="No encontramos esta página"
              description="Puede que el enlace esté mal o que lo que buscabas ya no exista."
              actions={<Button variant="secondary">Volver al calendario</Button>}
            />
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <DemoLabel>Skeleton → contenido</DemoLabel>
            <Button size="sm" variant="secondary" onClick={() => setLoading((l) => !l)}>
              {loading ? "Mostrar contenido" : "Simular carga"}
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {loading ? (
              <>
                <CardSkeleton lines={3} />
                <CardSkeleton lines={3} />
              </>
            ) : (
              <>
                <div className="animate-fade-in">
                  <Card>
                    <Metric label="Peso" value={61.2} unit="kg" size="lg" trend={{ delta: -1.4, unit: "kg", sentiment: "positive" }} />
                  </Card>
                </div>
                <div className="animate-fade-in">
                  <Card title="Próximo turno" description="Jueves 9 de octubre, 10:30">
                    <p className="text-body text-muted-foreground">Control mensual · 40 min</p>
                  </Card>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <DemoLabel>TableSkeleton</DemoLabel>
            <TableSkeleton rows={4} columns={4} />
          </div>
          <div>
            <DemoLabel>PageSkeleton</DemoLabel>
            <PageSkeleton />
          </div>
        </div>
      </div>
    </DemoSection>
  );
}
