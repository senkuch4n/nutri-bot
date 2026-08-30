"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { normalize } from "@nutri-bot/core";
import { Badge } from "@/components/ui";

export interface PatientRow {
  id: string;
  name: string | null;
  phone: string;
  upcoming: number;
}

export function PatientsList({ patients }: { patients: PatientRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const n = normalize(q);
    if (!n) return patients;
    const digits = n.replace(/\D/g, "");
    return patients.filter(
      (p) =>
        normalize(p.name ?? "").includes(n) ||
        (digits.length > 0 && p.phone.includes(digits)),
    );
  }, [q, patients]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="patient-search" className="sr-only">
          Buscar pacientes por nombre o teléfono
        </label>
        <div className="relative flex-1 sm:max-w-xs">
          <SearchIcon />
          <input
            id="patient-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre o teléfono…"
            className="w-full border border-line bg-paper py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-leaf focus:ring-2 focus:ring-leaf/15"
          />
        </div>
        <span className="whitespace-nowrap text-xs text-ink-faint">
          {filtered.length} de {patients.length}
        </span>
      </div>

      {patients.length === 0 ? (
        <EmptyBox>
          Todavía no hay pacientes. Aparecen acá cuando alguien le escribe al bot por WhatsApp o
          cuando cargás un turno.
        </EmptyBox>
      ) : filtered.length === 0 ? (
        <EmptyBox>
          Sin resultados para <span className="font-medium text-ink">«{q}»</span>.
        </EmptyBox>
      ) : (
        <ul className="reveal divide-y divide-line border border-line bg-paper">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/pacientes/${p.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-mint focus-visible:bg-mint focus-visible:outline-none"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {p.name ?? "(sin nombre)"}
                  </p>
                  <p className="truncate text-xs text-ink-soft">{p.phone}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {p.upcoming > 0 ? (
                    <Badge tone="green">
                      {p.upcoming} próximo{p.upcoming > 1 ? "s" : ""}
                    </Badge>
                  ) : (
                    <span className="text-xs text-ink-faint">sin turnos</span>
                  )}
                  <span aria-hidden className="text-ink-faint">
                    →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-line bg-paper px-6 py-12 text-center text-sm leading-relaxed text-ink-soft">
      {children}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}
