"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Archive, Search, SearchX, X } from "lucide-react";
import {
  PATIENT_ARCHIVE_TEXT,
  PATIENT_DIRECTORY_TEXT,
  matchesPatientQuery,
  patientCountLabel,
  type ArchivedPatientRow,
} from "@nutri-bot/core";
import { GroupedList, GroupedListRow } from "@/components/grouped-list";
import { Button as PrimitiveButton } from "@/components/primitives/button";
import { Button, EmptyState, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

const T = PATIENT_ARCHIVE_TEXT;

/** HU-019 (D2, SDD 7.4): pacientes archivadas, con buscador. Las filas llegan armadas del servidor
 *  (`buildArchivedPatientList`); acá solo se filtran. Tocar una fila abre la ficha. */
export function ArchivedPatientList({ rows }: { rows: ArchivedPatientRow[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const searching = q.trim() !== "";
  const shown = useMemo(() => (searching ? rows.filter((r) => matchesPatientQuery(r, q)) : rows), [rows, q, searching]);

  function clearSearch() {
    setQ("");
    inputRef.current?.focus({ preventScroll: true });
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && q !== "") {
      e.preventDefault();
      clearSearch();
    }
  }

  if (rows.length === 0) {
    return (
      <div className="max-w-3xl">
        <EmptyState icon={Archive} title={T.archivedEmpty} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="relative">
        <label htmlFor="archived-search" className="sr-only">
          {T.archivedSearchLabel}
        </label>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <input
          ref={inputRef}
          id="archived-search"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={T.archivedSearchPlaceholder}
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
            aria-label={PATIENT_DIRECTORY_TEXT.clearSearch}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden />
          </PrimitiveButton>
        ) : null}
      </form>

      <p aria-live="polite" className="mb-3 mt-2.5 px-1 text-footnote tabular-nums text-muted-foreground">
        {patientCountLabel(shown.length, rows.length, searching)}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={PATIENT_DIRECTORY_TEXT.noResultsTitle(q.trim())}
          description={PATIENT_DIRECTORY_TEXT.noResultsDescription}
          action={
            <Button variant="secondary" onClick={clearSearch}>
              {PATIENT_DIRECTORY_TEXT.clearSearch}
            </Button>
          }
        />
      ) : (
        <GroupedList>
          {shown.map((row) => (
            <GroupedListRow
              key={row.id}
              size="lg"
              href={`/pacientes/${row.id}`}
              label={<span className={cn(!row.name && "text-muted-foreground")}>{row.title}</span>}
              description={
                <>
                  {row.archivedLabel}
                  {row.name && row.phoneLabel ? (
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
      )}
    </div>
  );
}
