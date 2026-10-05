"use client";

import { useId } from "react";
import { SETTINGS_TEXT as T } from "@nutri-bot/core";
import { GroupedList } from "@/components/grouped-list";
import { Input } from "@/components/ui";
import { saveSignatureIdentityAction } from "./actions";
import { GroupFooter, SettingRow, useSettingsForm } from "./settings-ui";

export type SignatureIdentityDefaults = { title: string; licenseNumber: string };

/** HU-007 (D1), HU-016: título y matrícula del informe y del portal. Guarda solo estas dos columnas (Q19). */
export function SignatureIdentityForm({
  defaults,
  description,
}: {
  defaults: SignatureIdentityDefaults;
  description: string;
}) {
  const form = useSettingsForm("pdf", defaults, saveSignatureIdentityAction);
  const { values, set } = form;
  const titleId = useId();
  const licenseId = useId();

  return (
    <form onSubmit={form.onSubmit} noValidate>
      <GroupedList header={T.identityTitle} footer={description}>
        <SettingRow label={T.titleLabel} htmlFor={titleId} help={T.titleHelp}>
          <Input
            id={titleId}
            name="title"
            maxLength={20}
            placeholder="Lic."
            autoComplete="honorific-prefix"
            value={values.title}
            onChange={(e) => set("title", e.currentTarget.value)}
          />
        </SettingRow>
        <SettingRow label={T.licenseLabel} htmlFor={licenseId}>
          <Input
            id={licenseId}
            name="licenseNumber"
            maxLength={40}
            placeholder="M.P. 852"
            autoComplete="off"
            spellCheck={false}
            value={values.licenseNumber}
            onChange={(e) => set("licenseNumber", e.currentTarget.value)}
          />
        </SettingRow>
      </GroupedList>
      <GroupFooter dirty={form.dirty} pending={form.pending} error={form.error} />
    </form>
  );
}
