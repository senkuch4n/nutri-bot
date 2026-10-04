"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react";
import { ChevronRight, Pencil, Search, SearchX, Users, X } from "lucide-react";
import {
  HIDDEN_NUMBER_TEXT,
  PATIENT_DIRECTORY_TEXT,
  capitalizeFirst,
  matchesPatientQuery,
  patientCountLabel,
  type PatientDirectoryRow,
} from "@nutri-bot/core";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { Button as PrimitiveButton } from "@/components/primitives/button";
import { Button, EmptyState, inputClass } from "@/components/ui";
import { fades, springs } from "@/lib/motion";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { NameContactSheet } from "./name-contact-sheet";

const T = PATIENT_DIRECTORY_TEXT;

/** ¿El foco está en un lugar donde "/" es texto (o hay un diálogo abierto)? Entonces el atajo no actúa. */
function shortcutBlocked(target: EventTarget | null): boolean {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return true;
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

/** Lista de pacientes (HU-017c-1, SDD 5.1–5.6): buscador, filas con nombre, "Por completar" y el Sheet
 *  "Poner nombre". Las filas llegan armadas del servidor (`buildPatientDirectory`); acá solo se filtran. */
export function PatientDirectory({
  named,
  unnamed,
}: {
  named: PatientDirectoryRow[];
  unnamed: PatientDirectoryRow[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [incompleteByUser, setIncompleteByUser] = useState(false);
  const [editing, setEditing] = useState<PatientDirectoryRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const savedRef = useRef(false);

  const searching = q.trim() !== "";
  const namedShown = useMemo(
    () => (searching ? named.filter((r) => matchesPatientQuery(r, q)) : named),
    [named, q, searching],
  );
  const unnamedShown = useMemo(
    () => (searching ? unnamed.filter((r) => matchesPatientQuery(r, q)) : unnamed),
    [unnamed, q, searching],
  );
  const incompleteOpen = incompleteByUser || (searching && unnamedShown.length > 0);

  const focusSearch = useCallback(() => inputRef.current?.focus({ preventScroll: true }), []);
  const clearSearch = useCallback(() => {
    setQ("");
    focusSearch();
  }, [focusSearch]);

  // D13: autofoco solo con puntero fino (en el celular no abre el teclado). No se usa `autoFocus`.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) focusSearch();
  }, [focusSearch]);

  // Q3: "/" lleva al buscador, salvo que se esté escribiendo en otro campo o haya un diálogo abierto.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (shortcutBlocked(e.target)) return;
      e.preventDefault();
      focusSearch();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusSearch]);

  // Q4: Enter abre la ficha de la primera coincidencia con nombre.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const first = searching ? namedShown[0] : undefined;
    if (first) router.push(`/pacientes/${first.id}`);
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && q !== "") {
      e.preventDefault();
      clearSearch();
    }
  }

  function openNameSheet(row: PatientDirectoryRow) {
    savedRef.current = false;
    setEditing(row);
    setSheetOpen(true);
  }

  const onSaved = useCallback((name: string) => {
    savedRef.current = true;
    setSheetOpen(false);
    notify.saved(T.setNameDone(name));
  }, []);

  // La fila que abrió el Sheet desaparece al guardar: el foco va al buscador. Si se canceló, Radix lo
  // devuelve al botón "Poner nombre".
  const onCloseAutoFocus = useCallback(
    (event: Event) => {
      if (!savedRef.current) return;
      savedRef.current = false;
      event.preventDefault();
      focusSearch();
    },
    [focusSearch],
  );

  if (named.length === 0 && unnamed.length === 0) {
    return (
      <div className="max-w-3xl">
        <EmptyState icon={Users} title={T.emptyTitle} description={T.emptyDescription} />
      </div>
    );
  }

  const noResults = searching && namedShown.length === 0 && unnamedShown.length === 0;
  const showIncomplete = unnamed.length > 0 && (!searching || unnamedShown.length > 0);

  return (
    <div className="max-w-3xl">
      <form role="search" onSubmit={onSubmit} className="relative">
        <label htmlFor="patient-search" className="sr-only">
          {T.searchLabel}
        </label>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <input
          ref={inputRef}
          id="patient-search"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-keyshortcuts="/"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={T.searchPlaceholder}
          className={cn(
            inputClass,
            "h-12 rounded-lg pl-11 pr-12 text-body-lg",
            "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none",
          )}
        />
        {q !== "" ? (
          <PrimitiveButton
            type="button"
            variant="plain"
            size="icon-lg"
            onClick={clearSearch}
            aria-label={T.clearSearch}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden />
          </PrimitiveButton>
        ) : null}
      </form>

      <p aria-live="polite" className="mb-3 mt-2.5 px-1 text-footnote tabular-nums text-muted-foreground">
        {patientCountLabel(namedShown.length, named.length, searching)}
      </p>

      {noResults ? (
        <EmptyState
          icon={SearchX}
          title={T.noResultsTitle(q.trim())}
          description={T.noResultsDescription}
          action={
            <Button variant="secondary" onClick={clearSearch}>
              {T.clearSearch}
            </Button>
          }
        />
      ) : namedShown.length > 0 ? (
        <GroupedList>
          {namedShown.map((row) => (
            <GroupedListRow
              key={row.id}
              size="lg"
              href={`/pacientes/${row.id}`}
              label={row.name}
              description={
                <>
                  {row.statusLine}
                  {row.phoneLabel ? (
                    <>
                      {" · "}
                      <span className="whitespace-nowrap tabular-nums">{row.phoneLabel}</span>
                    </>
                  ) : null}
                </>
              }
            />
          ))}
        </GroupedList>
      ) : !searching ? (
        // Solo hay contactos sin nombre.
        <EmptyState icon={Users} title={T.emptyTitle} />
      ) : null}

      {showIncomplete ? (
        <IncompleteSection
          rows={unnamedShown}
          open={incompleteOpen}
          searching={searching}
          onToggle={() => setIncompleteByUser(!incompleteOpen)}
          onSetName={openNameSheet}
        />
      ) : null}

      <NameContactSheet
        row={editing}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={onSaved}
        onCloseAutoFocus={onCloseAutoFocus}
      />
    </div>
  );
}

function IncompleteSection({
  rows,
  open,
  searching,
  onToggle,
  onSetName,
}: {
  rows: PatientDirectoryRow[];
  open: boolean;
  searching: boolean;
  onToggle: () => void;
  onSetName: (row: PatientDirectoryRow) => void;
}) {
  const reduced = Boolean(useReducedMotionConfig());
  const contentId = useId();

  return (
    <section className="mt-8">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
        className="-mx-1 flex min-h-11 items-center gap-1.5 rounded-md px-1 text-left text-headline text-foreground press-none pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <m.span
          aria-hidden
          className="inline-flex text-muted-foreground"
          initial={false}
          animate={{ rotate: open ? 90 : 0 }}
          transition={reduced ? { duration: 0 } : springs.quick}
        >
          <ChevronRight className="size-5" strokeWidth={2} />
        </m.span>
        {T.incompleteTitle(rows.length)}
      </button>
      <p className="mb-3 px-1 text-footnote text-muted-foreground">{T.incompleteDescription}</p>
      <div id={contentId}>
        <AnimatePresence initial={false}>
          {open ? (
            <m.div
              key="incomplete"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fades.fast}
            >
              <GroupedList>
                {rows.map((row) => (
                  <IncompleteContactRow key={row.id} row={row} searching={searching} onSetName={onSetName} />
                ))}
              </GroupedList>
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}

function IncompleteContactRow({
  row,
  searching,
  onSetName,
}: {
  row: PatientDirectoryRow;
  searching: boolean;
  onSetName: (row: PatientDirectoryRow) => void;
}) {
  const label = row.phoneLabel ?? HIDDEN_NUMBER_TEXT;
  const description = searching
    ? `${T.unnamedLabel} · ${row.lastContactLabel}`
    : capitalizeFirst(row.lastContactLabel);

  return (
    <li className="relative flex items-center after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border last:after:hidden">
      <Link
        href={`/pacientes/${row.id}`}
        className="relative flex min-h-14 min-w-0 flex-1 flex-col justify-center px-4 py-3 text-left press-none transition-colors duration-hover hover:bg-overlay-hover pressed:bg-overlay-pressed focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className={cn("block text-headline text-foreground", row.phoneLabel && "tabular-nums")}>{label}</span>
        <span className="mt-0.5 block text-callout text-muted-foreground">{description}</span>
      </Link>
      <div className="shrink-0 pr-4">
        <Button variant="tinted" onClick={() => onSetName(row)} aria-label={`${T.setName}: ${label}`}>
          <Pencil aria-hidden />
          {T.setName}
        </Button>
      </div>
    </li>
  );
}
