"use client";

import { useState } from "react";
import { Bell, CreditCard, LogOut, Palette, Smartphone } from "lucide-react";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { Switch } from "@/components/primitives/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/primitives/table";
import { notify } from "@/lib/notify";
import { DemoLabel, DemoSection } from "./section";

const people = [
  ["María López", "34", "61,2", "jue 9/10"],
  ["Brenda Yebara", "28", "58,4", "vie 10/10"],
  ["Lucía Fernández", "41", "72,9", "lun 13/10"],
  ["Sofía Martínez", "19", "55,0", "mar 14/10"],
  ["Valentina Gómez", "52", "80,3", "mié 15/10"],
  ["Camila Ruiz", "23", "63,7", "jue 16/10"],
  ["Julieta Díaz", "37", "66,1", "vie 17/10"],
  ["Agustina Pérez", "45", "69,8", "lun 20/10"],
  ["Florencia Torres", "31", "57,6", "mar 21/10"],
  ["Micaela Romero", "26", "60,0", "mié 22/10"],
];

export function ListsSection() {
  const [reminders, setReminders] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <DemoSection
      id="listas"
      index={10}
      title="Listas y tablas"
      description="Filas tocables: el tono cambia en el pointer-down, sin escala (resaltado de fila de iOS)."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <GroupedList header="Notificaciones" footer="Los recordatorios salen 24 h antes del turno.">
            <GroupedListRow
              icon={Bell}
              label="Recordatorios"
              accessory={<Switch checked={reminders} onCheckedChange={setReminders} aria-label="Recordatorios" />}
            />
            <GroupedListRow icon={Smartphone} label="WhatsApp" value="Conectado" href="#listas" />
            <GroupedListRow icon={Palette} label="Logo y firma" description="Aparecen en los PDF" href="#listas" />
            <GroupedListRow icon={CreditCard} label="Mercado Pago" value="Sin vincular" disabled />
          </GroupedList>
          <GroupedList>
            <GroupedListRow label="Sin ícono, con valor" value="61,2 kg" />
            <GroupedListRow label="Acción" onClick={() => notify.info("Fila tocada")} />
            <GroupedListRow icon={LogOut} label="Cerrar sesión" destructive onClick={() => notify.info("Demo: no cierra sesión")} />
          </GroupedList>
          <GroupedList header='Filas grandes (size="lg")'>
            <GroupedListRow size="lg" label="Brenda Yebara" description="Hoy, 16:30 · +54 9 351 555-2345" href="#listas" />
            <GroupedListRow size="lg" label="Juan Pérez" description="Sin turno · Última consulta hace 3 semanas" href="#listas" />
          </GroupedList>
        </div>

        <div>
          <DemoLabel>Table: encabezado fijo (contenedor max-h-72) y filas con onClick</DemoLabel>
          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <Table containerClassName="max-h-72">
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead numeric>Edad</TableHead>
                  <TableHead numeric>Peso (kg)</TableHead>
                  <TableHead>Próximo turno</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map(([name, age, weight, next]) => (
                  <TableRow key={name} onClick={() => setPicked(name!)} data-state={picked === name ? "selected" : undefined}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell numeric>{age}</TableCell>
                    <TableCell numeric>{weight}</TableCell>
                    <TableCell className="text-muted-foreground">{next}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-footnote text-muted-foreground" aria-live="polite">
            {picked ? `Seleccionada: ${picked}` : "Tocá una fila."}
          </p>
        </div>
      </div>
    </DemoSection>
  );
}
