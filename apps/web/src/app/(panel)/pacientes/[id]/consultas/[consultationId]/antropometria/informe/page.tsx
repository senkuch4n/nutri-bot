import { notFound, redirect } from "next/navigation";
import { formatDateTime, professionalDataMissingNotice } from "@nutri-bot/core";
import { loadIsakReportContext } from "@/lib/anthropometric-report";
import { ReportEditor } from "./report-editor";

export const dynamic = "force-dynamic";

/** Informe antropométrico de la consulta (HU-007, épica 46). */
export default async function IsakReportPage({ params }: { params: Promise<{ id: string; consultationId: string }> }) {
  const { id, consultationId } = await params;
  const loaded = await loadIsakReportContext(id, consultationId);
  if (loaded.status === "not_found") notFound();
  if (loaded.status === "no_study") redirect(`${loaded.consultationHref}?aviso=sin-isak`);
  const { ctx } = loaded;
  const generatedAt = ctx.report?.pdfGeneratedAt ?? null;

  return (
    // Sin `key`: al revalidar después de guardar/generar se conserva el estado del editor (HU-006).
    <ReportEditor
      patientId={id}
      consultationId={consultationId}
      model={ctx.model}
      drafts={ctx.drafts}
      initialTexts={ctx.texts}
      phone={ctx.patient.phone}
      hasPdf={generatedAt !== null}
      lastPdfLabel={generatedAt ? formatDateTime(generatedAt, ctx.pro.timezone) : null}
      stale={ctx.stale}
      professionalNotice={professionalDataMissingNotice({
        licenseMissing: !ctx.pro.licenseNumber?.trim(),
        signatureMissing: !ctx.pro.signatureMimeType,
      })}
      reportHref={ctx.reportHref}
      studyHref={ctx.studyHref}
      editStudyHref={`${ctx.consultationHref}?isak=editar#antropometria-isak`}
    />
  );
}
