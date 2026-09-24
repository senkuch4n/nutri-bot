import { Fragment } from "react";
import {
  ISAK_MEASURE_GROUPS,
  ISAK_TEXT,
  formatFixedEs,
  formatSignedFixedEs,
  isakDifference,
  roundTo,
  type IsakStudyResult,
  type IsakValue,
} from "@nutri-bot/core";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/primitives/table";
import { ZScoreBar } from "./z-score-bar";

// Celdas compartidas por las tablas de la página del estudio ISAK (HU-006). Server-safe.

/** Valor de un cálculo: ok → número con decimales fijos (y unidad); missing → su nota en gris. */
export function IsakValueText({ value, decimals, unit }: { value: IsakValue | null | undefined; decimals: number; unit?: string }) {
  if (!value || value.status === "not_for_minors") return <span className="text-muted-foreground">—</span>;
  if (value.status === "missing") return <span className="text-xs text-muted-foreground">{value.note}</span>;
  return (
    <span className="tabular-nums">
      {formatFixedEs(value.value, decimals)}
      {unit ? <span className="text-muted-foreground">{" " + unit}</span> : null}
    </span>
  );
}

/** "−9,5" / "+1,2" / "—". */
export function diffText(current: IsakValue | null | undefined, previous: IsakValue | null | undefined, decimals: number): string {
  if (!current) return "—";
  const diff = isakDifference(current, previous, decimals);
  return diff === null ? "—" : formatSignedFixedEs(diff, decimals);
}

/** Celdas "Anterior" y "Dif." (solo si hay estudio anterior). */
export function PreviousCells({
  current,
  previous,
  decimals,
  unit,
}: {
  current: IsakValue | null | undefined;
  previous: IsakValue | null | undefined;
  decimals: number;
  unit?: string;
}) {
  return (
    <>
      <TableCell numeric>
        <IsakValueText value={previous} decimals={decimals} unit={unit} />
      </TableCell>
      <TableCell numeric>{diffText(current, previous, decimals)}</TableCell>
    </>
  );
}

const asValue = (v: number | null): IsakValue | null => (v === null ? null : { status: "ok", value: roundTo(v, 1) });

/** Tabla "Medidas": las 21 medidas con su Z, en 4 grupos. */
export function IsakMeasuresTable({ current, previous }: { current: IsakStudyResult; previous: IsakStudyResult | null }) {
  const columns = previous ? 6 : 4;
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Medida</TableHead>
            <TableHead numeric>Valor</TableHead>
            <TableHead numeric>Z</TableHead>
            <TableHead>
              <span className="sr-only">Barra de Z de −3 a +3</span>
            </TableHead>
            {previous ? (
              <>
                <TableHead numeric>Anterior</TableHead>
                <TableHead numeric>Dif.</TableHead>
              </>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ISAK_MEASURE_GROUPS.map((group) => (
            <Fragment key={group.key}>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns} className="bg-muted/50 py-1.5 text-xs font-semibold text-muted-foreground">
                  {group.title}
                </TableCell>
              </TableRow>
              {current.measures
                .filter((row) => row.group === group.key)
                .map((row) => {
                  const prevRow = previous?.measures.find((p) => p.key === row.key);
                  const z = row.z?.status === "ok" ? row.z.value : null;
                  return (
                    <TableRow key={row.key}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell numeric>
                        <IsakValueText value={asValue(row.value)} decimals={1} unit={row.unit} />
                      </TableCell>
                      <TableCell numeric>
                        {row.z === null ? <span className="text-muted-foreground">—</span> : <IsakValueText value={row.z} decimals={2} />}
                      </TableCell>
                      <TableCell>{row.z === null ? null : <ZScoreBar z={z} />}</TableCell>
                      {previous ? (
                        <PreviousCells
                          current={asValue(row.value)}
                          previous={asValue(prevRow?.value ?? null)}
                          decimals={1}
                          unit={row.unit}
                        />
                      ) : null}
                    </TableRow>
                  );
                })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
      <p className="mt-3 text-xs text-muted-foreground">{ISAK_TEXT.zFootnote}</p>
    </>
  );
}
