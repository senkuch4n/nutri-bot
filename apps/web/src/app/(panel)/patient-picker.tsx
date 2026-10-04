"use client";

import { useId, useMemo, useState, type Ref } from "react";
import { Plus, Search } from "lucide-react";
import {
  AGENDA_TEXT,
  HIDDEN_NUMBER_TEXT,
  PHONE_INPUT_TEXT,
  firstName,
  formatPhone,
  matchesPatientQuery,
  parsePhoneInput,
} from "@nutri-bot/core";
import { Button, Field, Input, cn } from "@/components/ui";
import type { AppointmentPatientOption } from "./actions";

const T = AGENDA_TEXT.create;
const MAX_RESULTS = 8;
const UNNAMED = "Sin nombre";

/** Para quién es el turno: buscando, una paciente existente o una nueva (nombre + teléfono escrito a mano). */
export type PatientChoice =
  | { kind: "search" }
  | { kind: "existing"; option: AppointmentPatientOption }
  | { kind: "new"; name: string; phone: string };

/** Nombre a mostrar de una opción (igual que patientDisplayName en el servidor). */
export function optionLabel(o: Pick<AppointmentPatientOption, "name" | "phoneLabel">): string {
  return o.name ?? o.phoneLabel ?? UNNAMED;
}

/** ¿Alcanza para crear el turno? (los errores se muestran recién al intentar o al salir del campo). */
export function patientChoiceReady(choice: PatientChoice): boolean {
  if (choice.kind === "existing") return true;
  if (choice.kind === "new") return choice.name.trim().length >= 2 && parsePhoneInput(choice.phone).ok;
  return false;
}

/**
 * "¿Para quién?" de "Nuevo turno" (HU-017b-1, SDD 5.2). Buscador con patrón combobox (↑/↓ mueven,
 * Enter elige, Esc borra la búsqueda) sobre la lista que se cargó al abrir. "Paciente nueva" pide el
 * nombre y el WhatsApp en formato libre, con la vista previa del número y el aviso si ya es de otra.
 */
export function PatientPicker({
  options,
  loadError,
  onRetry,
  choice,
  onChange,
  showErrors,
  searchRef,
}: {
  /** null = cargando. */
  options: AppointmentPatientOption[] | null;
  loadError: boolean;
  onRetry: () => void;
  choice: PatientChoice;
  onChange: (choice: PatientChoice) => void;
  /** Se intentó crear: se muestran los errores de "Paciente nueva". */
  showErrors: boolean;
  searchRef?: Ref<HTMLInputElement>;
}) {
  if (choice.kind === "existing") {
    const o = choice.option;
    return (
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2">
        <p className="min-w-0 text-callout">
          <span className="font-semibold">{o.name ?? UNNAMED}</span>
          <span className="text-muted-foreground"> · {o.phoneLabel ?? HIDDEN_NUMBER_TEXT}</span>
        </p>
        <Button type="button" variant="plain" size="sm" onClick={() => onChange({ kind: "search" })}>
          {T.change}
        </Button>
      </div>
    );
  }
  if (choice.kind === "new") {
    return <NewPatientFields choice={choice} options={options ?? []} onChange={onChange} showErrors={showErrors} />;
  }
  return <PatientSearch options={options} loadError={loadError} onRetry={onRetry} onChange={onChange} searchRef={searchRef} />;
}

function PatientSearch({
  options,
  loadError,
  onRetry,
  onChange,
  searchRef,
}: {
  options: AppointmentPatientOption[] | null;
  loadError: boolean;
  onRetry: () => void;
  onChange: (choice: PatientChoice) => void;
  searchRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const listId = `${id}-lista`;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    if (!options) return [];
    if (!query.trim()) return options.filter((o) => o.name !== null).slice(0, MAX_RESULTS);
    return options.filter((o) => matchesPatientQuery(o, query)).slice(0, MAX_RESULTS);
  }, [options, query]);
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  function startNew() {
    const q = query.trim();
    const isPhone = /^[\d\s+\-().]+$/.test(q);
    onChange({ kind: "new", name: isPhone ? "" : q, phone: isPhone ? q : "" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault(); // nunca manda el formulario desde el buscador
      const option = results[activeIndex];
      if (option) onChange({ kind: "existing", option });
    } else if (e.key === "Escape" && query) {
      // Esc con texto borra la búsqueda (el modal no se cierra: keepOpenWhileSearching); sin texto, cierra.
      e.preventDefault();
      setQuery("");
      setActive(0);
    }
  }

  const expanded = options !== null && results.length > 0;

  return (
    <div className="space-y-2">
      <label htmlFor={`${id}-buscar`} className="sr-only">
        {T.searchLabel}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={searchRef}
          id={`${id}-buscar`}
          type="search"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? `${id}-op-${activeIndex}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          placeholder={T.searchPlaceholder}
          className="h-11 pl-9"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {options === null ? (
        loadError ? (
          <div className="flex flex-wrap items-center gap-2 text-callout" role="alert">
            <span className="text-destructive">No se pudieron cargar las pacientes.</span>
            <Button type="button" variant="plain" size="sm" onClick={onRetry}>
              Probar de nuevo
            </Button>
          </div>
        ) : (
          <p role="status" className="text-callout text-muted-foreground">
            Cargando pacientes…
          </p>
        )
      ) : (
        <>
          <ul id={listId} role="listbox" aria-label={T.who} className="divide-y divide-border overflow-hidden rounded-lg border empty:hidden">
            {results.map((o, i) => (
              <li
                key={o.id}
                id={`${id}-op-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={cn(
                  "flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5 text-callout",
                  i === activeIndex ? "bg-overlay-hover" : "hover:bg-overlay-hover",
                )}
                // mousedown: elige antes de que el input pierda el foco.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange({ kind: "existing", option: o })}
                onMouseMove={() => i !== activeIndex && setActive(i)}
              >
                <span className="font-medium">{o.name ?? UNNAMED}</span>
                <span className="text-footnote text-muted-foreground">
                  {o.phoneLabel ?? HIDDEN_NUMBER_TEXT}
                  {o.statusLine ? ` · ${o.statusLine}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {query.trim() && results.length === 0 ? (
            <p role="status" className="text-callout text-muted-foreground">
              {T.noResults(query.trim())}
            </p>
          ) : null}
          <Button type="button" variant="tinted" onClick={startNew}>
            <Plus aria-hidden />
            {T.newPatient}
          </Button>
        </>
      )}
    </div>
  );
}

function NewPatientFields({
  choice,
  options,
  onChange,
  showErrors,
}: {
  choice: { kind: "new"; name: string; phone: string };
  options: AppointmentPatientOption[];
  onChange: (choice: PatientChoice) => void;
  showErrors: boolean;
}) {
  const id = useId();
  const [nameTouched, setNameTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const parsed = parsePhoneInput(choice.phone);
  const existing = parsed.ok ? options.find((o) => o.phoneDigits === parsed.digits) : undefined;

  const nameError =
    (showErrors || (nameTouched && choice.name !== "")) && choice.name.trim().length < 2 ? T.nameRequired : undefined;
  const phoneError =
    (showErrors || (phoneTouched && choice.phone !== "")) && !parsed.ok ? PHONE_INPUT_TEXT[parsed.error] : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-callout font-semibold">{T.newPatient}</p>
        <Button type="button" variant="plain" size="sm" onClick={() => onChange({ kind: "search" })}>
          {T.change}
        </Button>
      </div>
      <Field label={T.nameLabel} error={nameError}>
        <Input
          autoComplete="name"
          value={choice.name}
          aria-invalid={nameError ? true : undefined}
          onChange={(e) => onChange({ ...choice, name: e.target.value })}
          onBlur={() => setNameTouched(true)}
        />
      </Field>
      <div>
        <Field label={T.phoneLabel} error={phoneError} hint={PHONE_INPUT_TEXT.foreignHint}>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={choice.phone}
            aria-invalid={phoneError ? true : undefined}
            aria-describedby={`${id}-vista`}
            onChange={(e) => onChange({ ...choice, phone: e.target.value })}
            onBlur={() => setPhoneTouched(true)}
          />
        </Field>
        <div id={`${id}-vista`} aria-live="polite" className="mt-2 space-y-2 text-callout">
          {parsed.ok ? <p>{PHONE_INPUT_TEXT.confirmationPreview(formatPhone(parsed.digits))}</p> : null}
          {existing ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-warning-muted px-3 py-2">
              <span className="text-warning">{T.existing(optionLabel(existing))}</span>
              <Button
                type="button"
                variant="plain"
                size="sm"
                onClick={() => onChange({ kind: "existing", option: existing })}
              >
                {T.chooseExisting(firstName(existing.name) ?? optionLabel(existing))}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
