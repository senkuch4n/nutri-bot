"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import {
  AGENDA_TEXT,
  BOOKING_REASON_MAX,
  appointmentDayTime,
  formatInTimeZone,
  formatPhone,
  parsePhoneInput,
} from "@nutri-bot/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/primitives/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/primitives/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/primitives/toggle-group";
import { Button, FormError, Input, Select, Textarea } from "@/components/ui";
import { notify } from "@/lib/notify";
import { useMediaQuery } from "@/lib/use-media-query";
import { createAppointmentAction, listAppointmentPatientsAction, type AppointmentPatientOption } from "./actions";
import { PatientPicker, optionLabel, patientChoiceReady, type PatientChoice } from "./patient-picker";

const T = AGENDA_TEXT.create;

export interface ServiceOption {
  id: string;
  name: string;
  durationMin: number;
}

/** "2026-10-05" → "2026-10-06" (sin la zona del proceso). */
function nextDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1)).toISOString().slice(0, 10);
}

/** Esc dentro del buscador con texto borra la búsqueda (lo hace el buscador) en vez de cerrar. */
function keepOpenWhileSearching(e: KeyboardEvent) {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement && el.getAttribute("role") === "combobox" && el.value) e.preventDefault();
}

function focusFirstField(e: Event, searchRef: React.RefObject<HTMLInputElement | null>) {
  // Autofoco del buscador solo con puntero fino (D13 de 017c): en el celular no se abre el teclado solo.
  e.preventDefault();
  if (window.matchMedia("(pointer: fine)").matches) searchRef.current?.focus();
  else (e.currentTarget as HTMLElement | null)?.focus();
}

/**
 * "Nuevo turno" (HU-017b-1, SDD 5.2): modal desde 640 px y sheet inferior en el celular. Tres pasos:
 * para quién (buscador o paciente nueva), servicio y día/horario. Cada apertura arranca limpia.
 */
export function NewAppointmentModal({
  open,
  onClose,
  onCreated,
  services,
  tz,
  todayKey,
  initialDate,
  initialStart,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  services: ServiceOption[];
  tz: string;
  /** "yyyy-MM-dd" de hoy en la zona de la profesional ("Hoy" y "Mañana"). */
  todayKey: string;
  initialDate?: string;
  /** HU-017b-1 (Q4): horario tocado en la grilla (ISO); queda elegido si está libre. */
  initialStart?: string;
}) {
  const compact = useMediaQuery("(max-width: 639px)");
  const searchRef = useRef<HTMLInputElement>(null);
  // Cada apertura remonta el formulario (limpio, con el día y el horario tocados).
  const [formKey, setFormKey] = useState(0);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) setFormKey((k) => k + 1);
    wasOpen.current = open;
  }, [open]);

  const form = (
    <NewAppointmentForm
      key={formKey}
      services={services}
      tz={tz}
      todayKey={todayKey}
      initialDate={initialDate}
      initialStart={initialStart}
      searchRef={searchRef}
      onCancel={onClose}
      onCreated={() => {
        onCreated();
        onClose();
      }}
    />
  );
  const onOpenChange = (o: boolean) => {
    if (!o) onClose();
  };

  if (compact) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" onOpenAutoFocus={(e) => focusFirstField(e, searchRef)}
          onEscapeKeyDown={keepOpenWhileSearching}
          aria-describedby={undefined}
        >
          <SheetHeader>
            <SheetTitle>{T.title}</SheetTitle>
          </SheetHeader>
          {form}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => focusFirstField(e, searchRef)}
        onEscapeKeyDown={keepOpenWhileSearching}
      >
        <DialogHeader>
          <DialogTitle>{T.title}</DialogTitle>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, title, id, children }: { n: number; title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3 id={id} className="flex items-center gap-2 text-headline">
        <span
          aria-hidden
          className="inline-flex size-6 items-center justify-center rounded-full bg-secondary text-footnote font-semibold tabular-nums"
        >
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function NewAppointmentForm({
  services,
  tz,
  todayKey,
  initialDate,
  initialStart,
  searchRef,
  onCancel,
  onCreated,
}: {
  services: ServiceOption[];
  tz: string;
  todayKey: string;
  initialDate?: string;
  initialStart?: string;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const tomorrowKey = nextDayKey(todayKey);
  const [options, setOptions] = useState<AppointmentPatientOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [choice, setChoice] = useState<PatientChoice>({ kind: "search" });
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(initialDate ?? todayKey);
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // El horario tocado en la grilla se aplica una sola vez: al primer resultado del día inicial con servicio.
  const pendingStart = useRef(initialStart && date === (initialDate ?? todayKey) ? initialStart : undefined);

  // Q7: la lista de pacientes se carga al abrir (queda fresca después de crear una paciente).
  const loadPatients = useCallback(() => {
    setLoadError(false);
    setOptions(null);
    listAppointmentPatientsAction()
      .then(setOptions)
      .catch(() => setLoadError(true));
  }, []);
  useEffect(loadPatients, [loadPatients]);

  // "Cambiar" vuelve al buscador con el foco adentro.
  const prevKind = useRef(choice.kind);
  useEffect(() => {
    if (choice.kind === "search" && prevKind.current !== "search") searchRef.current?.focus();
    prevKind.current = choice.kind;
  }, [choice.kind, searchRef]);

  const service = services.find((s) => s.id === serviceId);

  useEffect(() => {
    setSlot("");
    if (!serviceId || !date) {
      setSlots([]);
      return;
    }
    let alive = true;
    setLoadingSlots(true);
    fetch(`/api/slots?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: string[]) => {
        if (!alive) return;
        setSlots(data);
        const wanted = pendingStart.current;
        if (wanted) {
          pendingStart.current = undefined;
          const match = data.find((d) => new Date(d).getTime() === new Date(wanted).getTime());
          if (match) setSlot(match);
          else {
            const name = services.find((s) => s.id === serviceId)?.name ?? "";
            setSlotNotice(T.slotNotFree(formatInTimeZone(new Date(wanted), tz, "H:mm"), name));
          }
        }
      })
      .catch(() => alive && setSlots([]))
      .finally(() => alive && setLoadingSlots(false));
    return () => {
      alive = false;
    };
  }, [serviceId, date, slotsVersion, services, tz]);

  const patientReady = patientChoiceReady(choice);
  const ready = patientReady && Boolean(slot) && Boolean(serviceId);
  const submitLabel = submitting ? T.submitting : !patientReady ? T.choosePatient : !slot ? T.chooseTime : T.submit;

  function changeDate(next: string) {
    setDate(next);
    setSlotNotice(null);
    pendingStart.current = undefined;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setError(null);
    if (!ready || choice.kind === "search") return;
    setSubmitting(true);
    const fd = new FormData();
    if (choice.kind === "existing") fd.set("patientId", choice.option.id);
    else {
      fd.set("patientName", choice.name);
      fd.set("patientPhone", choice.phone);
    }
    fd.set("serviceId", serviceId);
    fd.set("startsAt", slot);
    fd.set("reason", reason);
    const res = await createAppointmentAction({ ok: false }, fd);
    setSubmitting(false);
    if (res.ok) {
      const label = choice.kind === "existing" ? optionLabel(choice.option) : choice.name.trim();
      notify.saved(T.created(label, appointmentDayTime(new Date(slot), new Date(), tz)));
      onCreated();
      return;
    }
    if (res.existingPatient) {
      // Q10: el número es de otra paciente. Se muestra el aviso con "Elegir a …" sin borrar lo escrito.
      // El aviso de NewPatientFields la encuentra por los dígitos; si la lista no la tenía, se suma.
      const existing = res.existingPatient;
      const typed = choice.kind === "new" ? parsePhoneInput(choice.phone) : null;
      const digits = typed?.ok ? typed.digits : null;
      if (digits && !options?.some((o) => o.phoneDigits === digits)) {
        setOptions((list) => [
          ...(list ?? []),
          {
            id: existing.id,
            name: existing.name,
            contactKind: "phone",
            phoneLabel: formatPhone(digits),
            phoneDigits: digits,
            searchName: "",
            statusLine: "",
          },
        ]);
      }
      setError(res.error ?? null);
      return;
    }
    setError(res.error ?? T.genericError);
    if (res.error === T.slotGone) setSlotsVersion((v) => v + 1);
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Step n={1} title={T.who} id="nuevo-turno-quien">
        <PatientPicker
          options={options}
          loadError={loadError}
          onRetry={loadPatients}
          choice={choice}
          onChange={(c) => {
            setChoice(c);
            setError(null);
          }}
          showErrors={attempted}
          searchRef={searchRef}
        />
      </Step>

      <Step n={2} title={T.service} id="nuevo-turno-servicio">
        <label htmlFor="nuevo-turno-servicio-select" className="sr-only">
          {T.service}
        </label>
        <Select
          id="nuevo-turno-servicio-select"
          className="h-11"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          <option value="">{T.servicePlaceholder}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.durationMin} min)
            </option>
          ))}
        </Select>
      </Step>

      <Step n={3} title={T.day} id="nuevo-turno-dia">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: todayKey, label: AGENDA_TEXT.today },
            { key: tomorrowKey, label: T.tomorrow },
          ].map((d) => (
            <Button
              key={d.key}
              type="button"
              variant={date === d.key ? "tinted" : "secondary"}
              aria-pressed={date === d.key}
              className="h-11 rounded-lg px-4"
              onClick={() => changeDate(d.key)}
            >
              {d.label}
            </Button>
          ))}
          <label htmlFor="nuevo-turno-fecha" className="sr-only">
            {T.day}
          </label>
          <Input
            id="nuevo-turno-fecha"
            type="date"
            className="h-11 w-auto min-w-40 flex-1"
            value={date}
            min={todayKey}
            onChange={(e) => e.target.value && changeDate(e.target.value)}
          />
        </div>

        <div className="space-y-2 pt-1">
          <p id="nuevo-turno-horario" className="text-subheadline font-medium">
            {T.time}
          </p>
          {slotNotice ? (
            <p role="status" className="rounded-lg bg-warning-muted px-3 py-2 text-callout text-warning">
              {slotNotice}
            </p>
          ) : null}
          {!service ? (
            <p className="text-callout text-muted-foreground">{T.pickServiceFirst}</p>
          ) : loadingSlots ? (
            <p role="status" className="flex items-center gap-2 text-callout text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {T.loadingSlots}
            </p>
          ) : slots.length === 0 ? (
            <p className="text-callout text-muted-foreground">{T.noSlots}</p>
          ) : (
            <ToggleGroup
              type="single"
              variant="outline"
              value={slot}
              onValueChange={(v) => {
                if (!v) return;
                setSlot(v);
                setSlotNotice(null);
              }}
              aria-labelledby="nuevo-turno-horario"
              className="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2"
            >
              {slots.map((s) => (
                <ToggleGroupItem
                  key={s}
                  value={s}
                  className="h-11 text-headline tabular-nums data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {formatInTimeZone(new Date(s), tz, "H:mm")}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </div>
      </Step>

      <div className="space-y-1.5">
        <label htmlFor="nuevo-turno-motivo" className="block text-subheadline font-medium">
          {T.reasonLabel}
        </label>
        <Textarea
          id="nuevo-turno-motivo"
          name="reason"
          rows={3}
          maxLength={BOOKING_REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-describedby="nuevo-turno-motivo-ayuda"
        />
        <div id="nuevo-turno-motivo-ayuda" className="flex justify-between gap-2 text-footnote text-muted-foreground">
          <span>{T.reasonHint}</span>
          <span className="tabular-nums" aria-live="polite">
            {reason.length}/{BOOKING_REASON_MAX}
          </span>
        </div>
      </div>

      <FormError message={error} />

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-footnote text-muted-foreground sm:mr-auto">{T.whatsappNotice}</p>
        <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onCancel}>
          {T.cancel}
        </Button>
        <Button type="submit" className="w-full sm:w-auto" loading={submitting} disabled={!ready}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
