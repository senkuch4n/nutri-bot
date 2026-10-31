import { MorphDialogContentReady } from "@/components/primitives/morph-dialog";
import { PatientRecord } from "../../../[id]/patient-record";

export const dynamic = "force-dynamic";

/** La ficha completa dentro del modal (el diálogo lo pone el layout de esta ruta). Llega cuando el modal
 *  ya está abierto con el `loading`: `MorphDialogContentReady` hace que entre con la cascada. */
export default async function PatientModalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <MorphDialogContentReady />
      <PatientRecord id={id} variant="modal" />
    </>
  );
}
