"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m, useReducedMotionConfig } from "motion/react";
import { ChevronRight, LayoutGrid, Pencil, Rows3, Search, SearchX, Users, X } from "lucide-react";
import {
  HIDDEN_NUMBER_TEXT,
  PATIENT_DIRECTORY_TEXT,
  capitalizeFirst,
  matchesPatientQuery,
  patientCountLabel,
  patientStageCounts,
  type PatientDirectoryRow,
} from "@nutri-bot/core";
import { GroupedList } from "@/components/grouped-list";
import { Button as PrimitiveButton } from "@/components/primitives/button";
import { StatCard } from "@/components/stat-card";
import { Button, EmptyState, inputClass } from "@/components/ui";
import { fades, springs } from "@/lib/motion";
import { notify } from "@/lib/notify";
import { useMediaQuery } from "@/lib/use-media-query";
import { setPatientModalOrigin } from "@/lib/patient-modal-origin";
import { warmPatientRecordWhenIdle } from "./warm-patient-record";
import { cn } from "@/lib/utils";
import { NameContactSheet } from "./name-contact-sheet";
import { PatientCard, type PatientView } from "./patient-card";
import { PatientFilters, type PatientStageFilter } from "./patient-filters";

const T = PATIENT_DIRECTORY_TEXT;

/** Botones redondos del encabezado (buscar, vista). */
const headerIconButton =
  "relative inline-flex size-10 items-center justify-center rounded-full text-muted-foreground press-none touch-target transition-colors duration-hover hover:bg-overlay-hover hover:text-foreground pressed:bg-overlay-pressed aria-pressed:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** ¿El foco está en un lugar donde "/" es texto (o hay un diálogo abierto)? Entonces el atajo no actúa. */
function shortcutBlocked(target: EventTarget | null): boolean {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return true;
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

/** Pantalla "Pacientes": encabezado con buscar, «Filtros», vista y «Nuevo»; tarjetas con los totales;
 *  y la lista de tarjetas (o cuadrícula). Cada paciente abre su ficha en un modal. Debajo siguen
 *  "Por completar" (HU-017c-1) y el Sheet "Poner nombre". Las filas llegan armadas del servidor
 *  (`buildPatientDirectory`); acá solo se filtran. */
export function PatientDirectory({
  named,
  unnamed,
  archivedCount = 0,
  newPatient,
}: {
  named: PatientDirectoryRow[];
  unnamed: PatientDirectoryRow[];
  /** HU-019 (D2): cantidad de archivadas; la tarjeta «Archivados» lleva a esa vista si hay alguna. */
  archivedCount?: number;
  /** Botón «Nuevo» (diálogo de alta que crece desde él), armado por la página. */
  newPatient?: ReactNode;
}) {
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 640px)", true);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [stage, setStage] = useState<PatientStageFilter>("all");
  const [view, setView] = useState<PatientView>("list");
  // R1 (agregado de 017c-2): lo que elige la usuaria manda sobre la apertura automática. null = sin
  // elección; entonces se abre sola si la búsqueda tiene coincidencias sin nombre.
  const [incompleteChoice, setIncompleteChoice] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<PatientDirectoryRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const savedRef = useRef(false);

  const searching = q.trim() !== "";
  const counts = useMemo(() => patientStageCounts(named), [named]);
  const namedShown = useMemo(
    () =>
      named.filter((r) => (stage === "all" || r.stage === stage) && (!searching || matchesPatientQuery(r, q))),
    [named, q, searching, stage],
  );
  const unnamedShown = useMemo(
    () => (searching ? unnamed.filter((r) => matchesPatientQuery(r, q)) : unnamed),
    [unnamed, q, searching],
  );
  const incompleteAuto = searching && unnamedShown.length > 0;
  const incompleteOpen = incompleteChoice ?? incompleteAuto;

  // Una búsqueda nueva vuelve a abrirla sola si tiene coincidencias, salvo que la usuaria la haya
  // abierto ella (abierta se queda abierta).
  const wasSearching = useRef(searching);
  useEffect(() => {
    if (searching && !wasSearching.current) setIncompleteChoice((choice) => (choice === false ? null : choice));
    wasSearching.current = searching;
  }, [searching]);

  const focusSearch = useCallback(() => {
    setSearchOpen(true);
    // El campo se monta en este mismo render: el foco va en el próximo cuadro.
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, []);
  const clearSearch = useCallback(() => {
    setQ("");
    focusSearch();
  }, [focusSearch]);
  const closeSearch = useCallback(() => {
    setQ("");
    setSearchOpen(false);
  }, []);

  // Q3: "/" abre el buscador, salvo que se esté escribiendo en otro campo o haya un diálogo abierto.
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

  // La ficha se abre en el modal de la ruta interceptada (`(directorio)/@modal`); el elemento tocado
  // queda guardado para que el diálogo crezca desde ahí.
  const openPatient = useCallback(
    (row: PatientDirectoryRow, origin: HTMLElement | null) => {
      setPatientModalOrigin(origin, { initials: row.initials, name: row.name, stage: row.stage });
      router.push(`/pacientes/${row.id}`, { scroll: false });
    },
    [router],
  );
  // Precarga (hasta el `loading` del modal) al apuntar o enfocar una fila: el clic ya no espera al
  // servidor para que el modal exista y empiece la animación. Next deduplica las precargas repetidas
  // y solo precarga en producción.
  const prefetchPatient = useCallback((row: PatientDirectoryRow) => router.prefetch(`/pacientes/${row.id}`), [router]);
  // Los módulos de la ficha, con la lista quieta: la primera apertura no los evalúa en pleno vuelo.
  useEffect(() => warmPatientRecordWhenIdle(), []);

  // Q4: Enter abre la ficha de la primera coincidencia con nombre.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const first = searching ? namedShown[0] : undefined;
    if (first) openPatient(first, null);
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (q !== "") clearSearch();
    else closeSearch();
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

  const empty = named.length === 0 && unnamed.length === 0;
  const filtering = searching || stage !== "all";
  const noResults = filtering && namedShown.length === 0 && unnamedShown.length === 0;
  const showIncomplete = unnamed.length > 0 && (!searching || unnamedShown.length > 0);

  const header = (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <h1 className="text-title-1 font-medium">{T.title}</h1>
      <div className="flex items-center gap-1 sm:gap-2">
        {!empty ? (
          <>
            <button
              type="button"
              className={headerIconButton}
              aria-label={T.searchLabel}
              aria-expanded={searchOpen}
              aria-controls="patient-search"
              aria-keyshortcuts="/"
              onClick={() => (searchOpen ? closeSearch() : focusSearch())}
            >
              <Search className="size-5" strokeWidth={1.75} aria-hidden />
            </button>
            <PatientFilters stage={stage} wide={wide} onChange={setStage} />
            <div role="group" aria-label={T.viewLabel} className="flex items-center">
              <button
                type="button"
                className={headerIconButton}
                aria-label={T.viewGrid}
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <LayoutGrid className="size-5" strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                className={headerIconButton}
                aria-label={T.viewList}
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <Rows3 className="size-5" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
          </>
        ) : null}
        {newPatient}
      </div>
    </header>
  );

  if (empty) {
    return (
      <div>
        {header}
        <EmptyState icon={Users} title={T.emptyTitle} description={T.emptyDescription} />
      </div>
    );
  }

  return (
    <div>
      {header}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={T.cards.total} value={counts.total} primary />
        <StatCard label={T.cards.inProgress} value={counts.inProgress} />
        <StatCard label={T.cards.dropped} value={counts.dropped} />
        <StatCard
          label={T.cards.archived}
          value={archivedCount}
          href={archivedCount > 0 ? "/pacientes?vista=archivadas" : undefined}
          linkLabel={T.openArchived(archivedCount)}
        />
      </div>

      {searchOpen ? (
        <form role="search" onSubmit={onSubmit} className="relative mb-4">
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
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={T.searchPlaceholder}
            className={cn(
              inputClass,
              "h-12 rounded-xl pl-11 pr-12 text-body-lg",
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
      ) : null}

      {/* El contador no se ve (están las tarjetas), pero se sigue anunciando al filtrar. */}
      <p aria-live="polite" className="sr-only">
        {patientCountLabel(namedShown.length, named.length, filtering)}
      </p>

      {noResults ? (
        <EmptyState
          icon={SearchX}
          title={searching ? T.noResultsTitle(q.trim()) : T.stageFilter[stage]}
          description={searching ? T.noResultsDescription : undefined}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setStage("all");
                if (searching) clearSearch();
              }}
            >
              {searching ? T.clearSearch : T.clearFilters}
            </Button>
          }
        />
      ) : namedShown.length > 0 ? (
        <ul
          className={cn(
            view === "grid" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-3",
          )}
        >
          {namedShown.map((row) => (
            <PatientCard key={row.id} row={row} view={view} onOpen={openPatient} onIntent={prefetchPatient} />
          ))}
        </ul>
      ) : !filtering ? (
        // Solo hay contactos sin nombre.
        <EmptyState icon={Users} title={T.emptyTitle} />
      ) : null}

      {showIncomplete ? (
        <IncompleteSection
          rows={unnamedShown}
          open={incompleteOpen}
          searching={searching}
          onToggle={() => setIncompleteChoice(!incompleteOpen)}
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
