"use client";

import { useId, useState } from "react";
import { Checkbox } from "@/components/primitives/checkbox";
import { Label } from "@/components/primitives/label";
import { RadioGroup, RadioGroupItem } from "@/components/primitives/radio-group";
import { Switch } from "@/components/primitives/switch";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { DemoLabel, DemoSection } from "./section";

export function FormsSection() {
  const id = useId();
  const [reminders, setReminders] = useState(true);
  const [deposit, setDeposit] = useState(false);
  const [terms, setTerms] = useState(true);
  const [channel, setChannel] = useState("whatsapp");

  return (
    <DemoSection
      id="formularios"
      index={7}
      title="Formularios"
      description="Bordes de control a 3:1, halo azul de foco y 16 px en pantallas táctiles (sin zoom en Safari iOS). El switch es un objeto físico: probá presionarlo sin soltar."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl bg-card p-6 shadow-card">
          <DemoLabel>Campos</DemoLabel>
          <Field label="Nombre">
            <Input placeholder="María López" />
          </Field>
          <Field label="Peso (kg)" hint="Con coma decimal: 61,2">
            <Input inputMode="decimal" defaultValue="61,2" />
          </Field>
          <Field label="Teléfono" error="Falta el código de área.">
            <Input aria-invalid="true" defaultValue="1234-5678" />
          </Field>
          <Field label="Servicio">
            <Select defaultValue="control">
              <option value="primera">Primera consulta</option>
              <option value="control">Control mensual</option>
              <option value="antropometria">Antropometría ISAK</option>
            </Select>
          </Field>
          <Field label="Notas">
            <Textarea placeholder="Indicaciones para la próxima consulta…" />
          </Field>
          <Field label="Deshabilitado">
            <Input disabled defaultValue="No editable" />
          </Field>
        </div>

        <div className="space-y-6 rounded-xl bg-card p-6 shadow-card">
          <div>
            <DemoLabel>Switch</DemoLabel>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor={`${id}-rem`}>Recordatorios por WhatsApp</Label>
                <Switch id={`${id}-rem`} checked={reminders} onCheckedChange={setReminders} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor={`${id}-dep`}>Pedir seña</Label>
                <Switch id={`${id}-dep`} checked={deposit} onCheckedChange={setDeposit} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor={`${id}-dis`} className="opacity-40">
                  Deshabilitado
                </Label>
                <Switch id={`${id}-dis`} disabled checked />
              </div>
            </div>
          </div>

          <div>
            <DemoLabel>Checkbox</DemoLabel>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox id={`${id}-terms`} checked={terms} onCheckedChange={(v) => setTerms(v === true)} />
                <Label htmlFor={`${id}-terms`}>Mostrar el plan en el portal</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox id={`${id}-off`} />
                <Label htmlFor={`${id}-off`}>Enviar copia por mail</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox id={`${id}-cdis`} disabled />
                <Label htmlFor={`${id}-cdis`}>Deshabilitado</Label>
              </div>
            </div>
          </div>

          <div>
            <DemoLabel>Radio</DemoLabel>
            <RadioGroup value={channel} onValueChange={setChannel} aria-label="Canal de aviso">
              {[
                ["whatsapp", "WhatsApp"],
                ["mail", "Mail"],
                ["ninguno", "No avisar"],
              ].map(([value, label]) => (
                <div key={value} className="flex items-center gap-3">
                  <RadioGroupItem id={`${id}-${value}`} value={value!} />
                  <Label htmlFor={`${id}-${value}`}>{label}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>
      </div>
    </DemoSection>
  );
}
