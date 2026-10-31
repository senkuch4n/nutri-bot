"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Archive, ExternalLink, History, MessageCircle, Pencil, Plus } from "lucide-react";
import { PATIENT_ARCHIVE_TEXT, PATIENT_SUMMARY_TEXT } from "@nutri-bot/core";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { AppointmentPatientOption } from "../../actions";
import { NewAppointmentModal, type ServiceOption } from "../../new-appointment-modal";
import { useEditPatient } from "./edit-patient-sheet";
import { useArchivePatient, useUnarchivePatient } from "./patient-archive-controls";
import { usePatientTabs } from "./patient-tabs";

const T = PATIENT_SUMMARY_TEXT;

/** Botones redondeados del encabezado. Las acciones secundarias van como texto, sin fondo (referencia
 *  2026-10-31); el gris aparece al pasar el mouse. */
const pill = "rounded-full";
const quiet = "rounded-full font-normal hover:bg-black/[0.05]";

/** Acciones del encabezado de la ficha: «Agendar turno», «Editar datos», «Archivar» / «Desarchivar»,
 *  «Ver historial» y WhatsApp. Todas reutilizan lo que ya existía en la ficha. */
export function PatientHeaderActions({
  patientId,
  name,
  contactLabel,
  archived,
  pendingBlockedText,
  chatUrl,
  appointment,
}: {
  patientId: string;
  name: string | null;
  contactLabel: string;
  archived: boolean;
  pendingBlockedText: string | null;
  chatUrl: string | null;
  /** Para «Agendar turno»; null si no se puede agendar (archivada o contacto que no es persona). */
  appointment: { services: ServiceOption[]; tz: string; todayKey: string; patient: AppointmentPatientOption } | null;
}) {
  const router = useRouter();
  const editPatient = useEditPatient();
  const { go } = usePatientTabs();
  const archive = useArchivePatient({ patientId, name, contactLabel, pendingBlockedText });
  const { unarchive } = useUnarchivePatient(patientId);
  const [scheduling, setScheduling] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {appointment ? (
        <Button
          className={cn(pill, "bg-foreground text-background hover:bg-foreground/85 pressed:bg-foreground/75")}
          onClick={() => setScheduling(true)}
        >
          <Plus aria-hidden />
          {T.scheduleAppointment}
        </Button>
      ) : null}
      <Button variant="ghost" className={quiet} onClick={editPatient}>
        <Pencil aria-hidden />
        {T.editData}
      </Button>
      {archived ? (
        <Button variant="ghost" className={quiet} onClick={unarchive}>
          <ArchiveRestore aria-hidden />
          {PATIENT_ARCHIVE_TEXT.menuUnarchive}
        </Button>
      ) : (
        <Button variant="ghost" className={quiet} onClick={() => void archive()}>
          <Archive aria-hidden />
          {T.archive}
        </Button>
      )}
      <Button variant="ghost" className={quiet} onClick={() => go({ tab: "historial" })}>
        <History aria-hidden />
        {T.viewHistory}
      </Button>
      {chatUrl ? (
        <a
          href={chatUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-full px-4 text-callout text-foreground press-none transition-colors duration-hover hover:bg-black/[0.05] pressed:bg-fill-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-4"
        >
          <MessageCircle aria-hidden />
          {T.whatsapp}
          <ExternalLink className="text-muted-foreground" aria-hidden />
          <span className="sr-only"> {T.opensInNewTab}</span>
        </a>
      ) : null}

      {appointment ? (
        <NewAppointmentModal
          open={scheduling}
          onClose={() => setScheduling(false)}
          onCreated={() => router.refresh()}
          services={appointment.services}
          tz={appointment.tz}
          todayKey={appointment.todayKey}
          initialPatient={appointment.patient}
        />
      ) : null}
    </div>
  );
}
