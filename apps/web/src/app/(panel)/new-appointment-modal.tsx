"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { formatInTimeZone } from "@nutri-bot/core";
import { Modal } from "@/components/modal";
import { ToggleGroup, ToggleGroupItem } from "@/components/primitives/toggle-group";
import { Button, Field, FormError, Input, Select } from "@/components/ui";
import { notify } from "@/lib/notify";
import { createAppointmentAction } from "./actions";

export interface ServiceOption {
  id: string;
  name: string;
  durationMin: number;
}

function todayInTz(tz: string): string {
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
}

export function NewAppointmentModal({
  open,
  onClose,
  onCreated,
  services,
  tz,
  initialDate,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  services: ServiceOption[];
  tz: string;
  initialDate?: string;
}) {
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(initialDate ?? todayInTz(tz));
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setDate(initialDate ?? todayInTz(tz));
  }, [open, initialDate, tz]);

  useEffect(() => {
    setSlot("");
    if (!serviceId || !date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    fetch(`/api/slots?serviceId=${serviceId}&date=${date}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: string[]) => setSlots(data))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [serviceId, date]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!slot) {
      setError("Elegí un horario.");
      return;
    }
    setSubmitting(true);
    const fd = new FormData();
    fd.set("patientName", name);
    fd.set("patientPhone", phone);
    fd.set("serviceId", serviceId);
    fd.set("startsAt", slot);
    const res = await createAppointmentAction({ ok: false }, fd);
    setSubmitting(false);
    if (res.ok) {
      setName("");
      setPhone("");
      setServiceId("");
      setSlot("");
      notify.saved("Turno creado");
      onCreated();
      onClose();
    } else {
      setError(res.error ?? "No se pudo crear el turno.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo turno"
      description="El paciente recibe la confirmación por WhatsApp."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del paciente">
            <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </Field>
          <Field label="Teléfono / WhatsApp" hint="Solo números, con código de país">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="549XXXXXXXXXX"
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Servicio">
            <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
              <option value="">Elegir…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.durationMin} min)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Día">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>

        <div>
          <p id="nuevo-turno-horario" className="mb-2 text-sm font-medium">
            Horario
          </p>
          {!serviceId ? (
            <p className="text-sm text-muted-foreground">Elegí un servicio y un día.</p>
          ) : loadingSlots ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              Buscando horarios…
            </p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay horarios disponibles ese día.</p>
          ) : (
            <ToggleGroup
              type="single"
              variant="outline"
              value={slot}
              onValueChange={(v) => v && setSlot(v)}
              aria-labelledby="nuevo-turno-horario"
              className="flex flex-wrap justify-start gap-2"
            >
              {slots.map((s) => (
                <ToggleGroupItem
                  key={s}
                  value={s}
                  className="tabular-nums data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground"
                >
                  {formatInTimeZone(new Date(s), tz, "HH:mm")}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </div>

        <FormError message={error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={submitting} disabled={!slot}>
            {submitting ? "Creando…" : "Crear turno"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
