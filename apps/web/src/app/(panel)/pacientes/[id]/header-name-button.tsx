"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { PATIENT_DIRECTORY_TEXT, type PatientDirectoryRow } from "@nutri-bot/core";
import { Button } from "@/components/ui";
import { notify } from "@/lib/notify";
import { NameContactSheet } from "../name-contact-sheet";

/** "Poner nombre" en el encabezado de una ficha sin nombre (HU-017c-2). Reutiliza el Sheet de la lista
 *  (017c-1), que escribe solo `Patient.name`; la revalidación de la action refresca la ficha. */
export function HeaderNameButton({ patientId, phoneLabel }: { patientId: string; phoneLabel: string | null }) {
  const [open, setOpen] = useState(false);
  // El Sheet solo usa id y phoneLabel; el resto de la fila no aplica en la ficha.
  const row: PatientDirectoryRow = {
    id: patientId,
    name: null,
    contactKind: phoneLabel ? "phone" : "hidden",
    phoneLabel,
    phoneDigits: null,
    searchName: "",
    statusLine: "",
    lastContactLabel: "",
  };
  return (
    <>
      <Button type="button" variant="tinted" onClick={() => setOpen(true)}>
        <Pencil aria-hidden />
        {PATIENT_DIRECTORY_TEXT.setName}
      </Button>
      <NameContactSheet
        row={row}
        open={open}
        onOpenChange={setOpen}
        onSaved={(name) => {
          setOpen(false);
          notify.saved(PATIENT_DIRECTORY_TEXT.setNameDone(name));
        }}
      />
    </>
  );
}
