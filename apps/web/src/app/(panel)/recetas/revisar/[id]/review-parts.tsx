"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check, ChevronLeft, ImageOff, Maximize2, MoreHorizontal, Upload } from "lucide-react";
import type { IngredientLineFlag } from "@nutri-bot/core/recipe-import";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/primitives/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/primitives/dropdown-menu";
import { SegmentedControl } from "@/components/segmented-control";
import { Button } from "@/components/ui";
import { reviewHref } from "../review-href";

// HU-018a-2 (SDD 7.5): piezas de la pantalla de revisión de borradores. Pensada para revisar ~40
// recetas seguidas: una acción principal ("Publicar y seguir"), atajos de teclado que funcionan
// aunque el foco esté en un campo, y lo de referencia (original y macros) siempre a la vista.

/** Lo que la pantalla de revisión le pasa a RecipeForm (modo "review"). */
export interface RecipeReview {
  /** 1-based; 0 si el borrador no está en la cola filtrada. */
  position: number;
  total: number;
  /** Filtro por recetario (?archivo=). */
  file: string | null;
  files: { file: string; count: number }[];
  /** "Saltar": el siguiente de la cola (o null si es el único). */
  nextId: string | null;
  original: {
    pageImageUrl: string | null;
    pageImageFullUrl: string | null;
    rawText: string | null;
    warnings: string[];
    /** "Almuerzos y cenas 2 · pág. 7". */
    label: string;
  };
  candidates: { id: string; thumbUrl: string; fullUrl: string }[];
}


/** Mac → ⌘; el resto → Ctrl. Se resuelve en el cliente (en el servidor arranca como Ctrl). */
export function useModKey(): "⌘" | "Ctrl" {
  const [mod, setMod] = useState<"⌘" | "Ctrl">("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setMod("⌘");
  }, []);
  return mod;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-xs border border-input bg-background px-1.5 py-0.5 font-sans text-caption text-muted-foreground">
      {children}
    </kbd>
  );
}

// ── Barra superior ────────────────────────────────────────────────────────────────────────────

export function ReviewBar({
  review,
  saving,
  publishing,
  discarding,
  kcalText,
  onNavigate,
  onSave,
  onPublish,
  onDiscard,
}: {
  review: RecipeReview;
  saving: boolean;
  publishing: boolean;
  discarding: boolean;
  kcalText: string;
  onNavigate: (href: string) => void;
  onSave: () => void;
  onPublish: () => void;
  onDiscard: () => void;
}) {
  const mod = useModKey();
  const busy = saving || publishing || discarding;
  // La columna de referencia es sticky justo debajo de la barra: su alto cambia si la barra se envuelve.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--review-bar-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--review-bar-h");
    };
  }, []);
  const totalAll = review.files.reduce((a, f) => a + f.count, 0);
  const progress = review.total > 0 && review.position > 0 ? review.position / review.total : 0;

  return (
    <div ref={barRef} className="material-bar sticky top-14 z-20 -mx-6 -mt-8 mb-6 border-b px-6 pb-3 pt-3 lg:top-0 lg:-mx-10 lg:px-10">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/recetas?estado=revisar"
          className="-ml-1 inline-flex min-h-11 items-center gap-0.5 rounded-md text-callout text-primary press-none pressed:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
          Recetas
        </Link>

        <div className="min-w-0">
          <p className="text-headline tabular-nums" aria-live="polite">
            {review.position > 0 ? `Borrador ${review.position} de ${review.total}` : "Borrador"}
          </p>
          <div
            className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-label="Avance de la revisión"
            aria-valuemin={0}
            aria-valuemax={review.total}
            aria-valuenow={review.position}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>

        <label className="sr-only" htmlFor="review-file">
          Recetario
        </label>
        <select
          id="review-file"
          value={review.file ?? ""}
          onChange={(e) => onNavigate(reviewHref(null, e.target.value || null))}
          className="h-11 max-w-64 truncate rounded-lg border border-input bg-background px-3 pr-8 text-callout text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <option value="">Todos los recetarios ({totalAll})</option>
          {review.files.map((f) => (
            <option key={f.file} value={f.file}>
              {f.file.replace(/\.pdf$/i, "")} ({f.count})
            </option>
          ))}
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <p className="mr-2 text-callout tabular-nums text-muted-foreground lg:hidden" aria-hidden>
            {kcalText}
          </p>
          {review.nextId ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={busy}
              onClick={() => onNavigate(reviewHref(review.nextId, review.file))}
            >
              Saltar
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="lg"
            loading={saving}
            disabled={busy && !saving}
            onClick={onSave}
            aria-keyshortcuts={mod === "⌘" ? "Meta+S" : "Control+S"}
          >
            Guardar borrador
          </Button>
          <Button
            type="button"
            size="lg"
            loading={publishing}
            disabled={busy && !publishing}
            onClick={onPublish}
            aria-keyshortcuts={mod === "⌘" ? "Meta+Enter" : "Control+Enter"}
          >
            Publicar y seguir
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="lg" className="px-3" aria-label="Más acciones" disabled={busy}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="min-h-11 text-destructive" onSelect={onDiscard}>
                Descartar borrador
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <p className="mt-2 hidden text-footnote text-muted-foreground md:block">
        Atajos: <Kbd>{mod}</Kbd> <Kbd>↵</Kbd> publicar y seguir · <Kbd>{mod}</Kbd> <Kbd>S</Kbd> guardar borrador
      </p>
    </div>
  );
}

// ── Columna "Original" ───────────────────────────────────────────────────────────────────────

export function OriginalPanel({ original }: { original: RecipeReview["original"] }) {
  const [view, setView] = useState<"page" | "text">(original.pageImageUrl ? "page" : "text");
  const [zoom, setZoom] = useState(false);

  return (
    <section aria-labelledby="review-original-title" className="rounded-xl bg-card p-4 shadow-card more-contrast:border more-contrast:border-input">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="review-original-title" className="text-headline">
          Original
        </h2>
        <SegmentedControl
          aria-label="Ver el original como"
          value={view}
          onValueChange={setView}
          options={[
            { value: "page", label: "Página", disabled: !original.pageImageUrl },
            { value: "text", label: "Texto", disabled: !original.rawText },
          ]}
        />
      </div>

      {view === "page" && original.pageImageUrl ? (
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="group relative block w-full overflow-hidden rounded-lg border bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Ver la página a pantalla completa"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada (sesión), tamaño variable */}
          <img src={original.pageImageUrl} alt={`Página original: ${original.label}`} className="h-auto w-full" />
          <span className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-background/80 text-foreground shadow-card">
            <Maximize2 className="size-4" aria-hidden />
          </span>
        </button>
      ) : (
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-callout">
          {original.rawText ?? "Sin texto."}
        </pre>
      )}
      <p className="mt-2 text-footnote text-muted-foreground">{original.label}</p>

      {original.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 text-footnote text-warning" aria-label="Avisos de la lectura">
          {original.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-h-[95dvh] max-w-4xl overflow-auto">
          <DialogTitle>Página original</DialogTitle>
          <DialogDescription>{original.label}</DialogDescription>
          {original.pageImageFullUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen privada (sesión)
            <img src={original.pageImageFullUrl} alt={`Página original: ${original.label}`} className="h-auto w-full rounded-lg" />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ── Fotos encontradas ────────────────────────────────────────────────────────────────────────

export type PhotoChoice = "none" | "current" | "upload" | `cand:${string}`;

const tileClass =
  "relative grid aspect-[4/3] w-[120px] shrink-0 place-items-center overflow-hidden rounded-lg border-2 border-transparent bg-muted text-callout text-muted-foreground press-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=checked]:border-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary";

function CheckedMark() {
  return (
    <RadioGroupPrimitive.Indicator className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
      <Check className="size-4" strokeWidth={3} aria-hidden />
    </RadioGroupPrimitive.Indicator>
  );
}

export function PhotoCandidates({
  value,
  candidates,
  currentUrl,
  uploadUrl,
  onChange,
  onUpload,
  recipeName,
}: {
  value: PhotoChoice;
  candidates: RecipeReview["candidates"];
  currentUrl: string | null;
  uploadUrl: string | null;
  onChange: (value: PhotoChoice) => void;
  onUpload: () => void;
  recipeName: string;
}) {
  return (
    <div>
      <p id="review-photos-label" className="mb-2 text-subheadline font-medium">
        Fotos encontradas
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <RadioGroupPrimitive.Root
          aria-labelledby="review-photos-label"
          value={value}
          onValueChange={(v) => onChange(v as PhotoChoice)}
          className="flex flex-wrap gap-3"
        >
          {currentUrl ? (
            <RadioGroupPrimitive.Item value="current" className={tileClass} aria-label="Foto actual">
              <Image src={currentUrl} alt="" fill unoptimized sizes="120px" className="object-cover" />
              <CheckedMark />
            </RadioGroupPrimitive.Item>
          ) : null}
          {candidates.map((c, i) => (
            <RadioGroupPrimitive.Item key={c.id} value={`cand:${c.id}`} className={tileClass} aria-label={`Foto ${i + 1} de la página`}>
              <Image src={c.thumbUrl} alt="" fill unoptimized sizes="120px" className="object-cover" />
              <CheckedMark />
            </RadioGroupPrimitive.Item>
          ))}
          {uploadUrl ? (
            <RadioGroupPrimitive.Item value="upload" className={tileClass} aria-label={`Foto subida para ${recipeName || "la receta"}`}>
              <Image src={uploadUrl} alt="" fill unoptimized sizes="120px" className="object-cover" />
              <CheckedMark />
            </RadioGroupPrimitive.Item>
          ) : null}
          <RadioGroupPrimitive.Item value="none" className={tileClass}>
            <span className="flex flex-col items-center gap-1">
              <ImageOff className="size-5" aria-hidden />
              Ninguna
            </span>
            <CheckedMark />
          </RadioGroupPrimitive.Item>
        </RadioGroupPrimitive.Root>
        <Button type="button" variant="secondary" size="lg" onClick={onUpload}>
          <Upload aria-hidden />
          Subir otra
        </Button>
      </div>
      {candidates.length === 0 ? (
        <p className="mt-2 text-footnote text-muted-foreground">No se encontraron fotos en la página. La foto es opcional.</p>
      ) : null}
    </div>
  );
}

// ── Ingrediente en modo revisión ─────────────────────────────────────────────────────────────

const FLAG_TEXT: Record<IngredientLineFlag, string> = {
  HOUSEHOLD_ONLY: "El texto no dice los gramos.",
  VOLUME_ONLY: "Está en cc: pasalo a gramos o marcá c.n.",
  APPROX: "Dice «aprox.»: revisá.",
  AMBIGUOUS_GRAMS: "Hay dos cantidades: elegí una.",
  MULTI_FOOD: "Parecen dos ingredientes: separalos con «Agregar ingrediente».",
};

export function flagMessages(flags: readonly IngredientLineFlag[]): string[] {
  return flags.map((f) => FLAG_TEXT[f]);
}

export function SuggestionLine({
  rawText,
  suggestion,
  onAccept,
  onChangeFood,
  onDismiss,
}: {
  rawText: string | null;
  suggestion: { name: string; grams: string } | null;
  onAccept: () => void;
  onChangeFood: () => void;
  onDismiss: () => void;
}) {
  if (!rawText && !suggestion) return null;
  return (
    <div className="space-y-2 rounded-md bg-muted/60 px-3 py-2">
      {rawText ? (
        <p className="text-footnote text-muted-foreground">
          Del recetario: <q className="text-foreground">{rawText}</q>
        </p>
      ) : null}
      {suggestion ? (
        <>
          <p className="text-callout">
            Sugerido: <span className="font-semibold">{suggestion.name}</span>
            {suggestion.grams ? <span className="tabular-nums"> · {suggestion.grams} g</span> : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="tinted" size="lg" onClick={onAccept}>
              <Check aria-hidden />
              Aceptar
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={onChangeFood}>
              Cambiar
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={onDismiss}>
              Dejar como texto
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
