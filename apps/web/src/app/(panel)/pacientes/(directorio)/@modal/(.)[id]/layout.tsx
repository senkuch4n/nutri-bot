import { PatientRecordModal } from "../../../patient-record-modal";

/** El diálogo vive en el layout: se mantiene montado mientras `loading.tsx` cede el lugar a la ficha,
 *  así la animación de apertura corre una sola vez. */
export default function PatientModalLayout({ children }: { children: React.ReactNode }) {
  return <PatientRecordModal>{children}</PatientRecordModal>;
}
