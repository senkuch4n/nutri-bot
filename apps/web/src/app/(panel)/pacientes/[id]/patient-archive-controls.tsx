"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { PATIENT_ARCHIVE_TEXT } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { MoreActionsMenu } from "@/components/more-actions-menu";
import { notify } from "@/lib/notify";
import { archivePatientAction, unarchivePatientAction } from "../actions";

const T = PATIENT_ARCHIVE_TEXT;

/** HU-019: desarchivar sin confirmación (no tiene riesgo), idempotente. Lo usan el menú "Más" y el
 *  banner de archivada. `pending` evita el doble envío mientras corre. */
export function useUnarchivePatient(patientId: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const unarchive = useCallback(async () => {
    setPending(true);
    try {
      const r = await unarchivePatientAction(patientId);
      if (!r.ok) {
        notify.error(r.error);
        return;
      }
      notify.saved(T.unarchived(r.name));
      router.refresh();
    } finally {
      setPending(false);
    }
  }, [patientId, router]);
  return { unarchive, pending };
}

type ArchiveInput = {
  patientId: string;
  /** Nombre recortado o null. */
  name: string | null;
  /** Para la confirmación sin nombre: teléfono formateado o HIDDEN_NUMBER_TEXT. */
  contactLabel: string;
  /** archiveBlockedText del próximo turno pendiente, o null si no tiene. */
  pendingBlockedText: string | null;
};

/**
 * HU-019 (SDD 7.1): «Archivar paciente» (no destructivo: no se pierde nada).
 * - Con un turno pendiente conocido al cargar la ficha, el aviso sale sin llamar a la action.
 * - Si el turno apareció mientras se confirmaba (carrera), la action devuelve `blocked` con el mismo aviso.
 */
export function useArchivePatient({ patientId, name, contactLabel, pendingBlockedText }: ArchiveInput) {
  const router = useRouter();
  const confirm = useConfirm();

  const showBlocked = useCallback(
    async (text: string) => {
      const seeAppointments = await confirm({
        title: T.blockedTitle,
        description: text,
        confirmLabel: T.seeAppointments,
        cancelLabel: T.close,
        destructive: false,
      });
      if (seeAppointments) router.push(`/pacientes/${patientId}?tab=turnos`);
    },
    [confirm, patientId, router],
  );

  return useCallback(async () => {
    if (pendingBlockedText) return showBlocked(pendingBlockedText);
    const ok = await confirm({
      title: T.confirmTitle(name),
      description: name ? T.confirmDescription : T.confirmDescriptionUnnamed(contactLabel),
      confirmLabel: T.confirmLabel,
      cancelLabel: T.cancel,
      destructive: false,
    });
    if (!ok) return;
    const r = await archivePatientAction(patientId);
    if (!r.ok) {
      if (r.blocked) return showBlocked(r.error);
      notify.error(r.error);
      return;
    }
    router.push("/pacientes");
    notify.undo(T.archived(r.name), async () => {
      const u = await unarchivePatientAction(patientId);
      if (u.ok) router.refresh();
      else notify.error(u.error);
    });
  }, [confirm, contactLabel, name, patientId, pendingBlockedText, router, showBlocked]);
}

/** Menú "Más" del encabezado de la ficha. Activa → «Archivar paciente»; archivada → «Desarchivar». */
export function PatientArchiveControls({
  archived,
  ...input
}: ArchiveInput & { archived: boolean }) {
  const { unarchive } = useUnarchivePatient(input.patientId);
  const archive = useArchivePatient(input);

  return (
    <MoreActionsMenu
      label="Más opciones de la paciente"
      actions={[
        archived
          ? { key: "unarchive", label: T.menuUnarchive, icon: <ArchiveRestore />, onSelect: unarchive }
          : { key: "archive", label: T.menuArchive, icon: <Archive />, onSelect: archive },
      ]}
    />
  );
}
