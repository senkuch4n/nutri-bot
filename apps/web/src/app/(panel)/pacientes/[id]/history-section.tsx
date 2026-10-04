"use client";

import type { ReactNode } from "react";
import { PATIENT_SUMMARY_TEXT } from "@nutri-bot/core";
import { SegmentedControl } from "@/components/segmented-control";
import { HISTORY_VIEWS, type HistoryView } from "@/lib/patient-tab-route";
import { cn } from "@/lib/utils";
import { usePatientTabs } from "./patient-tabs";

const VIEW_LABELS: Record<HistoryView, string> = {
  medidas: "Peso y medidas",
  turnos: "Turnos",
  diario: "Diario",
};

/**
 * Pestaña Historial (HU-017c-2): control segmentado Peso y medidas · Turnos · Diario. Las tres vistas
 * quedan montadas (las inactivas con `hidden`), así no se pierde lo escrito en "Nueva medición".
 */
export function HistorySection({
  panels,
  diaryHasRecent,
}: {
  panels: Record<HistoryView, ReactNode>;
  diaryHasRecent: boolean;
}) {
  const { view, setView } = usePatientTabs();
  const options = HISTORY_VIEWS.map((value) => ({
    value,
    label:
      value === "diario" && diaryHasRecent ? (
        <span className="inline-flex items-center gap-1.5">
          {VIEW_LABELS[value]}
          <span aria-hidden className="inline-block size-1.5 rounded-full bg-primary" />
          <span className="sr-only"> {PATIENT_SUMMARY_TEXT.recentHint}</span>
        </span>
      ) : (
        VIEW_LABELS[value]
      ),
  }));

  return (
    <div>
      <SegmentedControl
        value={view}
        onValueChange={setView}
        options={options}
        aria-label="Qué ver del historial"
        size="md"
        className="max-sm:w-full"
      />
      {HISTORY_VIEWS.map((value) => (
        <div
          key={value}
          role="region"
          aria-label={VIEW_LABELS[value]}
          hidden={value !== view}
          className={cn("mt-6", value === view && "animate-fade-in")}
        >
          {panels[value]}
        </div>
      ))}
    </div>
  );
}
