"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  CURRENCY_OPTIONS,
  OTHER_OPTION_VALUE,
  PHONE_INPUT_TEXT,
  SETTINGS_TEXT as T,
  TIMEZONE_OPTIONS,
  formatPhone,
  otherTimezoneLabel,
  parsePhoneInput,
  type Option,
} from "@nutri-bot/core";
import { GroupedList } from "@/components/grouped-list";
import { Input, Select, Textarea } from "@/components/ui";
import { saveGeneralSettingsAction } from "./actions";
import { GroupFooter, SettingRow, useSettingsForm } from "./settings-ui";

export type GeneralDefaults = {
  timezone: string;
  currency: string;
  /** El número guardado, ya con formato ("+54 9 351 555-2345") o "". */
  phone: string;
  acceptedInsurances: string;
};

const noopSubscribe = () => () => {};

/** true recién después de hidratar: las listas completas de Intl pueden variar entre Node y el navegador. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function allTimezones(): Option[] {
  try {
    return Intl.supportedValuesOf("timeZone")
      .map((value) => ({ value, label: otherTimezoneLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  } catch {
    return [];
  }
}

function allCurrencies(): Option[] {
  try {
    const names = new Intl.DisplayNames(["es"], { type: "currency" });
    return Intl.supportedValuesOf("currency")
      .map((value) => {
        const name = names.of(value);
        const label = name && name !== value ? `${name.charAt(0).toUpperCase()}${name.slice(1)} (${value})` : value;
        return { value, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  } catch {
    return [];
  }
}

/**
 * Lista corta con "Otra…" (D21). Al elegir "Otra…" aparece la lista completa; un valor guardado que no
 * está en la lista corta arranca directamente ahí. Lo que viaja en el form es `name` = el valor real.
 */
function ListWithOther({
  id,
  name,
  value,
  onChange,
  options,
  otherLabel,
  loadAll,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  otherLabel: string;
  loadAll: () => Option[];
}) {
  const inList = options.some((o) => o.value === value);
  const [otherMode, setOtherMode] = useState(!inList);
  const hydrated = useHydrated();
  const showOther = otherMode || !inList;
  const all = useMemo(() => (hydrated && showOther ? loadAll() : []), [hydrated, showOther, loadAll]);
  // Antes de hidratar (o sin soporte de Intl) la lista completa trae al menos el valor actual.
  const fullList = all.length > 0 ? all : value ? [{ value, label: value }] : [];

  return (
    <div className="space-y-2">
      <Select
        id={id}
        value={showOther ? OTHER_OPTION_VALUE : value}
        onChange={(e) => {
          const next = e.currentTarget.value;
          if (next === OTHER_OPTION_VALUE) {
            setOtherMode(true);
          } else {
            setOtherMode(false);
            onChange(next);
          }
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value={OTHER_OPTION_VALUE}>{T.other}</option>
      </Select>
      {showOther ? (
        <Select aria-label={otherLabel} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
          {fullList.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : null}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

/** General → "Tus datos": zona horaria, moneda, Tu WhatsApp y obras sociales. Guarda solo esto (Q19). */
export function GeneralForm({ defaults }: { defaults: GeneralDefaults }) {
  const form = useSettingsForm("general", defaults, saveGeneralSettingsAction);
  const { values, set } = form;
  const ids = { tz: useId(), currency: useId(), phone: useId(), phoneHelp: useId(), insurances: useId() };

  const parsed = parsePhoneInput(values.phone);
  const phoneHelp = parsed.ok
    ? T.phonePreview(formatPhone(parsed.digits))
    : parsed.error === "empty"
      ? T.phoneEmpty
      : `${PHONE_INPUT_TEXT.invalid}. ${PHONE_INPUT_TEXT.foreignHint}`;

  return (
    <form onSubmit={form.onSubmit} noValidate>
      <GroupedList header={T.yourData}>
        <SettingRow label={T.timezone} htmlFor={ids.tz} help={T.timezoneHelp}>
          <ListWithOther
            id={ids.tz}
            name="timezone"
            value={values.timezone}
            onChange={(v) => set("timezone", v)}
            options={TIMEZONE_OPTIONS}
            otherLabel={T.otherTimezone}
            loadAll={allTimezones}
          />
        </SettingRow>
        <SettingRow label={T.currency} htmlFor={ids.currency}>
          <ListWithOther
            id={ids.currency}
            name="currency"
            value={values.currency}
            onChange={(v) => set("currency", v)}
            options={CURRENCY_OPTIONS}
            otherLabel={T.otherCurrency}
            loadAll={allCurrencies}
          />
        </SettingRow>
        <SettingRow
          label={T.phone}
          htmlFor={ids.phone}
          helpId={ids.phoneHelp}
          help={
            <span aria-live="polite" className={parsed.ok ? "text-foreground" : undefined}>
              {phoneHelp}
            </span>
          }
        >
          <Input
            id={ids.phone}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            spellCheck={false}
            placeholder={T.phonePlaceholder}
            aria-describedby={ids.phoneHelp}
            value={values.phone}
            onChange={(e) => set("phone", e.currentTarget.value)}
          />
        </SettingRow>
        <SettingRow label={T.insurances} htmlFor={ids.insurances} help={T.insurancesHelp} stacked>
          <Textarea
            id={ids.insurances}
            name="acceptedInsurances"
            rows={2}
            maxLength={500}
            placeholder={T.insurancesPlaceholder}
            value={values.acceptedInsurances}
            onChange={(e) => set("acceptedInsurances", e.currentTarget.value)}
          />
        </SettingRow>
      </GroupedList>
      <p className="px-4 pt-1.5 text-footnote text-muted-foreground">{T.phoneHelp}</p>
      <GroupFooter
        dirty={form.dirty}
        pending={form.pending}
        error={form.error}
        aside={
          <Link
            href="/servicios"
            className="inline-flex min-h-11 items-center gap-0.5 rounded-md text-callout text-primary press-none pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {T.remindersLink}
            <ChevronRight className="size-4" strokeWidth={2} aria-hidden />
          </Link>
        }
      />
    </form>
  );
}
