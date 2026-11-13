"use client";

import { useId } from "react";
import { SETTINGS_TEXT as T } from "@nutri-bot/core";
import { GroupedList } from "@/components/grouped-list";
import { Textarea } from "@/components/ui";
import { DEFAULT_PDF_ACCENT } from "@/lib/pdf-theme";
import { savePdfStyleAction } from "./actions";
import { GroupFooter, SettingRow, useSettingsForm } from "./settings-ui";

export type PdfStyleDefaults = { pdfAccentColor: string; pdfFooterText: string };

/** Informes en PDF → "Color y pie de página". Guarda solo estas dos columnas (Q19). */
export function PdfStyleForm({ defaults }: { defaults: PdfStyleDefaults }) {
  // Sin color guardado, el selector muestra el de siempre; si no lo toca, se sigue guardando vacío.
  const form = useSettingsForm("pdf", defaults, savePdfStyleAction);
  const { values, set } = form;
  const colorId = useId();
  const footerId = useId();
  const shownColor = values.pdfAccentColor || DEFAULT_PDF_ACCENT;

  return (
    <form onSubmit={form.onSubmit} noValidate>
      <GroupedList header={T.pdfStyleTitle}>
        <SettingRow label={T.pdfColor} htmlFor={colorId} help={T.pdfColorHelp}>
          <div className="flex items-center gap-3 sm:justify-end">
            <input
              id={colorId}
              type="color"
              value={shownColor}
              onChange={(e) => set("pdfAccentColor", e.currentTarget.value)}
              className="h-11 w-16 cursor-pointer rounded-md border border-input bg-background p-1 focus-visible:border-ring focus-visible:shadow-focus focus-visible:outline-none"
            />
            <span className="font-mono text-footnote uppercase text-muted-foreground" translate="no">
              {shownColor}
            </span>
          </div>
          <input type="hidden" name="pdfAccentColor" value={values.pdfAccentColor} />
        </SettingRow>
        <SettingRow label={T.pdfFooter} htmlFor={footerId} help={T.pdfFooterHelp} stacked>
          <Textarea
            id={footerId}
            name="pdfFooterText"
            rows={2}
            maxLength={300}
            placeholder={T.pdfFooterPlaceholder}
            value={values.pdfFooterText}
            onChange={(e) => set("pdfFooterText", e.currentTarget.value)}
          />
        </SettingRow>
      </GroupedList>
      <GroupFooter dirty={form.dirty} pending={form.pending} error={form.error} />
    </form>
  );
}
