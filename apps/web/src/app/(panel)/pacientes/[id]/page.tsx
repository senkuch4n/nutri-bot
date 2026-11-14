import { PatientRecord } from "./patient-record";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientRecord id={id} variant="page" />;
}
