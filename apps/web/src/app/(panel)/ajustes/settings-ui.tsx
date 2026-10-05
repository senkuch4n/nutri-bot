"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SETTINGS_TEXT as T } from "@nutri-bot/core";
import { Button, FormError, cn } from "@/components/ui";
import { useActionToast } from "@/lib/notify";
import type { SettingsState } from "./actions";

// HU-017b-4 (D19): piezas compartidas de Ajustes. Cada grupo es su propio <form>, guarda solo lo suyo y
// avisa si quedó con cambios sin guardar; el índice marca la sección con un punto.

export type SettingsSection = "general" | "whatsapp" | "google" | "pdf";

type DirtyApi = { report: (key: string, section: SettingsSection, dirty: boolean) => void };

const DirtyContext = createContext<DirtyApi | null>(null);
const DirtySectionsContext = createContext<ReadonlySet<SettingsSection>>(new Set());

/** Junta qué grupos tienen cambios sin guardar. Lo monta `AjustesTabs`. */
export function SettingsDirtyProvider({ children }: { children: ReactNode }) {
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlyMap<string, SettingsSection>>(new Map());
  const report = useCallback((key: string, section: SettingsSection, dirty: boolean) => {
    setDirtyKeys((prev) => {
      if (dirty === prev.has(key)) return prev;
      const next = new Map(prev);
      if (dirty) next.set(key, section);
      else next.delete(key);
      return next;
    });
  }, []);
  const api = useMemo(() => ({ report }), [report]);
  const sections = useMemo(() => new Set(dirtyKeys.values()), [dirtyKeys]);
  return (
    <DirtyContext.Provider value={api}>
      <DirtySectionsContext.Provider value={sections}>{children}</DirtySectionsContext.Provider>
    </DirtyContext.Provider>
  );
}

/** Secciones con algún grupo a medio guardar. */
export function useDirtySections(): ReadonlySet<SettingsSection> {
  return useContext(DirtySectionsContext);
}

/** El grupo avisa si tiene cambios sin guardar (y deja de avisar al desmontarse). */
export function useReportDirty(section: SettingsSection, dirty: boolean): void {
  const api = useContext(DirtyContext);
  const key = useId();
  useEffect(() => {
    api?.report(key, section, dirty);
  }, [api, key, section, dirty]);
  useEffect(() => () => api?.report(key, section, false), [api, key, section]);
}

type Values = Record<string, string>;

function sameValues(a: Values, b: Values): boolean {
  return Object.keys(a).every((k) => a[k] === b[k]);
}

/**
 * Form de un grupo con campos controlados: arranca con lo guardado, sabe si está "sucio" y, al guardar
 * bien, toma lo enviado como lo nuevo guardado. Se despacha a mano (no `<form action>`) para que React 19
 * no resetee el form: con un error, lo tipeado queda. El doble clic no manda dos veces (`pending`).
 */
export function useSettingsForm<V extends Values>(
  section: SettingsSection,
  saved: V,
  action: (prev: SettingsState, fd: FormData) => Promise<SettingsState>,
) {
  const [values, setValues] = useState<V>(saved);
  const [baseline, setBaseline] = useState<V>(saved);
  const submitted = useRef<V>(saved);
  const [state, dispatch, pending] = useActionState(action, { ok: false } satisfies SettingsState);
  useActionToast(state, { success: T.saved });

  // Lo guardado cambió en el servidor (la página se revalidó): pasa a ser la base.
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    setBaseline(JSON.parse(savedKey) as V);
  }, [savedKey]);

  useEffect(() => {
    if (state.ok) setBaseline(submitted.current);
  }, [state]);

  const dirty = !sameValues(values, baseline);
  useReportDirty(section, dirty);

  const set = useCallback(<K extends keyof V>(key: K, value: V[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    submitted.current = values;
    startTransition(() => dispatch(fd));
  }

  return { values, set, dirty, pending, error: state.ok ? undefined : state.error, onSubmit };
}

/**
 * Fila de una lista agrupada con un control: etiqueta a la izquierda y el control a la derecha desde
 * 640 px; en el celular, uno abajo del otro. Mismo separador hairline que `GroupedListRow`.
 */
export function SettingRow({
  label,
  htmlFor,
  help,
  helpId,
  children,
  stacked = false,
}: {
  label: ReactNode;
  htmlFor?: string;
  help?: ReactNode;
  helpId?: string;
  children: ReactNode;
  /** El control ocupa todo el ancho, debajo de la etiqueta (textos largos). */
  stacked?: boolean;
}) {
  return (
    <li className="relative px-4 py-3 after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border last:after:hidden">
      <div className={cn("flex flex-col gap-2", !stacked && "sm:flex-row sm:items-center sm:justify-between sm:gap-6")}>
        {htmlFor ? (
          <label htmlFor={htmlFor} className="shrink-0 text-callout text-foreground">
            {label}
          </label>
        ) : (
          <span className="shrink-0 text-callout text-foreground">{label}</span>
        )}
        <div className={cn("min-w-0", !stacked && "sm:w-80 sm:max-w-[60%]")}>{children}</div>
      </div>
      {help ? (
        <div id={helpId} className="mt-1.5 text-footnote text-muted-foreground">
          {help}
        </div>
      ) : null}
    </li>
  );
}

/** Fila con un switch a la derecha (también en el celular): etiqueta, descripción y control. */
export function SwitchRow({
  label,
  description,
  descriptionId,
  control,
  labelFor,
}: {
  label: string;
  description?: ReactNode;
  descriptionId?: string;
  control: ReactNode;
  labelFor: string;
}) {
  return (
    <li className="relative flex min-h-11 items-center gap-4 px-4 py-3 after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border last:after:hidden">
      <div className="min-w-0 flex-1">
        <label htmlFor={labelFor} className="block text-callout text-foreground">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-footnote text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </li>
  );
}

/** Pie del grupo: "Cambios sin guardar" (si corresponde), el error y "Guardar". */
export function GroupFooter({
  dirty,
  pending,
  error,
  aside,
}: {
  dirty: boolean;
  pending: boolean;
  error?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mt-3 space-y-2 px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-footnote text-muted-foreground">{aside}</div>
        <div className="ml-auto flex items-center gap-3">
          {dirty && !pending ? (
            <span className="inline-flex items-center gap-1.5 text-footnote text-muted-foreground">
              <span aria-hidden className="size-2 rounded-full bg-primary" />
              {T.unsaved}
            </span>
          ) : null}
          <Button type="submit" loading={pending}>
            {pending ? T.saving : T.save}
          </Button>
        </div>
      </div>
      <FormError message={error} />
    </div>
  );
}
