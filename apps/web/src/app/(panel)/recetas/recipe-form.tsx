"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { ArrowDown, ArrowUp, Camera, ExternalLink, Plus } from "lucide-react";
import {
  RECIPE_MOMENTS,
  RECIPE_MOMENT_LABELS,
  RECIPE_STATUS_LABELS,
  RECIPE_TAGS,
  RECIPE_TAG_LABELS,
  RECIPE_TEXT,
  RECIPE_TYPES,
  RECIPE_TYPE_LABELS,
  computeItemMacros,
  computeRecipeMacros,
  formatMacroAmount,
  parseEsArNumber,
  recipePhotoSizeError,
  recipeUsageWarning,
  validateRecipeForPublish,
  type FoodGroupKey,
  type RecipeMomentKey,
  type RecipePublishIssue,
  type RecipeTagKey,
  type RecipeTypeKey,
} from "@nutri-bot/core";
import type { RecipeCatalogFood, RecipeDetail } from "@nutri-bot/db/domain";
import { useConfirm } from "@/components/confirm";
import { FoodCatalogProvider } from "@/components/food-catalog";
import { Checkbox } from "@/components/primitives/checkbox";
import { ChipGroup } from "@/components/recipes/chip-group";
import { IngredientFoodPicker } from "@/components/recipes/ingredient-food-picker";
import { RecipePhoto } from "@/components/recipes/recipe-photo";
import { Badge, Button, FormError, Input, PageHeader, Textarea, inputClass } from "@/components/ui";
import { notify } from "@/lib/notify";
import { recipePhotoUrl } from "@/lib/recipe-view";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";
import { cn } from "@/lib/utils";
import { archiveRecipeAction, saveRecipeAction, unarchiveRecipeAction } from "./actions";
import { recipeFormSnapshot, rowHasContent, snapshotAfterSave } from "./recipe-form-state";
import { RecipePortionSummary } from "./recipe-portion-summary";
import type { RecipeActionState } from "./recipe-save";
import {
  OriginalPanel,
  PhotoCandidates,
  ReviewBar,
  SuggestionLine,
  reviewHref,
  type PhotoChoice,
  type RecipeReview,
} from "./revisar/[id]/review-parts";

// HU-018a: ficha / editor de una receta (SDD 7.3). Los macros se calculan en vivo con
// computeRecipeMacros; no hay ningún campo para cargarlos a mano (D4). Una acción principal
// ("Guardar"), objetivos de 44 px y lo opcional plegado en "Más datos".
// HU-018a-2 (SDD 7.5): con `review`, el mismo form es la pantalla de revisión de un borrador de la
// carga asistida (original al lado, fotos encontradas, sugerencias de alimento, "Publicar y seguir").
// Lo propio de la revisión (sugerencias, avisos del parser y actions) llega por `review`, así el
// parser no entra al bundle del editor.

/** Modo revisión: los datos de la cola + el comportamiento que arma review-screen.tsx. */
export interface RecipeReviewProps extends RecipeReview {
  /** suggestFood(label, catálogo). NUNCA se aplica sola: la acepta la persona. */
  suggest: (label: string) => { foodId: string } | null;
  /** Avisos del parser para la línea original ("El texto no dice los gramos."). */
  flagsFor: (rawText: string) => string[];
  saveDraft: (fd: FormData) => Promise<RecipeActionState>;
  publish: (fd: FormData) => Promise<RecipeActionState & { nextId?: string | null }>;
  discard: (id: string, file: string | null) => Promise<{ ok: boolean; nextId: string | null; error?: string }>;
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

type Row = {
  key: string;
  foodId: string | null;
  label: string;
  grams: string;
  noQuantity: boolean;
  household: string;
  rawText: string | null;
  showLabel: boolean;
  /** Revisión: "Dejar como texto" oculta la sugerencia hasta recargar (12-D12). */
  dismissed: boolean;
};

type PublishedText = { portionText: string; kcal: string; protein: string; carbs: string; fat: string; fiber: string };

const numText = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const BAD_NUMBER = "Escribí un número, por ejemplo 2,5.";
let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;

function emptyRow(): Row {
  return { key: newKey(), foodId: null, label: "", grams: "", noQuantity: false, household: "", rawText: null, showLabel: false, dismissed: false };
}

/** "" → null; número válido → number; texto inválido → undefined. */
function parseNumber(text: string): number | null | undefined {
  const r = parseEsArNumber(text);
  return r.ok ? r.value : undefined;
}

const textOrNull = (s: string) => (s.trim() === "" ? null : s.trim());

function DecimalInput({
  id,
  value,
  onChange,
  unit,
  invalid,
  describedBy,
  disabled,
  className,
  ariaLabel,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "h-11 pr-14 text-right text-body tabular-nums")}
      />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-callout text-muted-foreground">
        {unit}
      </span>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-footnote text-destructive">
      {message}
    </p>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-subheadline font-medium text-foreground">
      {children}
    </label>
  );
}

const TYPE_OPTIONS = RECIPE_TYPES.map((v) => ({ value: v, label: RECIPE_TYPE_LABELS[v] }));
const MOMENT_OPTIONS = RECIPE_MOMENTS.map((v) => ({ value: v, label: RECIPE_MOMENT_LABELS[v] }));
const TAG_OPTIONS = RECIPE_TAGS.map((v) => ({ value: v, label: RECIPE_TAG_LABELS[v] }));

/** Dónde llevar el foco para cada error del resumen. */
const FIELD_TARGET: Record<string, string> = {
  name: "recipe-name",
  type: "recipe-type",
  moments: "recipe-moments",
  yieldPortions: "recipe-yield",
  portionHousehold: "recipe-portion",
  portionGrams: "recipe-portion-grams",
  ingredients: "recipe-add-ingredient",
  sourceName: "recipe-source",
};

export function RecipeForm(props: {
  recipe: RecipeDetail | null;
  foods: RecipeCatalogFood[];
  usage: { plans: number; templates: number };
  initialPhotoError?: string | null;
  review?: RecipeReviewProps;
}) {
  return (
    <FoodCatalogProvider foods={props.foods}>
      <RecipeFormInner {...props} />
    </FoodCatalogProvider>
  );
}

function RecipeFormInner({
  recipe,
  foods,
  usage,
  initialPhotoError,
  review,
}: {
  recipe: RecipeDetail | null;
  foods: RecipeCatalogFood[];
  usage: { plans: number; templates: number };
  initialPhotoError?: string | null;
  review?: RecipeReviewProps;
}) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [archiving, startArchive] = useTransition();
  const origin = recipe?.origin ?? "MANUAL";

  // ── Estado del formulario ──
  const [name, setName] = useState(recipe?.name ?? "");
  const [type, setType] = useState<RecipeTypeKey | null>(recipe?.type ?? null);
  const [moments, setMoments] = useState<RecipeMomentKey[]>(recipe?.moments ?? []);
  const [tags, setTags] = useState<RecipeTagKey[]>(recipe?.tags ?? []);
  const [yieldText, setYieldText] = useState(numText(recipe?.yieldPortions));
  const [portionHousehold, setPortionHousehold] = useState(recipe?.portionHousehold ?? "");
  const [portionGramsText, setPortionGramsText] = useState(numText(recipe?.portionGrams));
  const [preparation, setPreparation] = useState(recipe?.preparation ?? "");
  const [tips, setTips] = useState(recipe?.tips ?? "");
  const [sourceName, setSourceName] = useState(recipe?.sourceName ?? "");
  const [published, setPublished] = useState<PublishedText>({
    portionText: recipe?.published?.portionText ?? "",
    kcal: numText(recipe?.published?.kcal),
    protein: numText(recipe?.published?.protein),
    carbs: numText(recipe?.published?.carbs),
    fat: numText(recipe?.published?.fat),
    fiber: numText(recipe?.published?.fiber),
  });
  const [rows, setRows] = useState<Row[]>(() =>
    recipe && recipe.ingredients.length > 0
      ? recipe.ingredients.map((i) => ({
          key: newKey(),
          foodId: i.food?.id ?? null,
          label: i.label ?? "",
          grams: numText(i.grams),
          noQuantity: i.noQuantity,
          household: i.household ?? "",
          rawText: i.rawText,
          showLabel: false,
          dismissed: false,
        }))
      : [emptyRow()],
  );

  // ── Foto ──
  // Después de "Quitar foto" + Guardar, la foto vieja se oculta hasta que llegan los datos nuevos.
  const [gonePhotoId, setGonePhotoId] = useState<string | null>(null);
  const savedPhotoId = recipe?.photo?.id ?? null;
  const existingPhotoId = savedPhotoId !== null && savedPhotoId !== gonePhotoId ? savedPhotoId : null;
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [credit, setCredit] = useState(recipe?.photo?.credit ?? "");
  const [photoError, setPhotoError] = useState<string | null>(initialPhotoError ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Revisión: una de las "Fotos encontradas" (se copia a la foto de la receta al guardar).
  const [candidateId, setCandidateId] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  // Cuando llega la foto guardada (id nuevo), la vista previa local ya no hace falta.
  useEffect(() => {
    setPreviewUrl(null);
  }, [existingPhotoId]);

  const candidateUrl = review && candidateId ? (review.candidates.find((c) => c.id === candidateId)?.fullUrl ?? null) : null;
  const displayUrl =
    previewUrl ??
    candidateUrl ??
    (existingPhotoId && !removePhoto ? recipePhotoUrl(existingPhotoId, "panel", "full") : null);
  const photoChoice: PhotoChoice = photoFile
    ? "upload"
    : candidateId
      ? `cand:${candidateId}`
      : existingPhotoId && !removePhoto
        ? "current"
        : "none";

  function onPhotoChoice(choice: PhotoChoice) {
    setPhotoError(null);
    if (choice === "upload") return;
    setPhotoFile(null);
    setPreviewUrl(null);
    if (choice === "none") {
      setCandidateId(null);
      setRemovePhoto(Boolean(existingPhotoId));
    } else if (choice === "current") {
      setCandidateId(null);
      setRemovePhoto(false);
    } else {
      setCandidateId(choice.slice("cand:".length));
      setRemovePhoto(false);
    }
  }

  function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const sizeError = recipePhotoSizeError(file.size);
    const typeOk = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (sizeError || !typeOk) {
      setPhotoError(RECIPE_TEXT.photoInvalid);
      return;
    }
    setPhotoError(null);
    setPhotoFile(file);
    setCandidateId(null);
    setRemovePhoto(false);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function onRemovePhoto() {
    setCandidateId(null);
    setPhotoFile(null);
    setPreviewUrl(null);
    setRemovePhoto(Boolean(existingPhotoId));
    setPhotoError(null);
  }

  // ── Catálogo y macros en vivo ──
  const catalog = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const yieldValue = parseNumber(yieldText);
  const yieldPortions = typeof yieldValue === "number" ? yieldValue : null;
  const macroResult = useMemo(
    () =>
      computeRecipeMacros(
        rows.map((r) => {
          const food = r.foodId ? catalog.get(r.foodId) : undefined;
          const g = parseNumber(r.grams);
          return {
            label: r.label.trim() || null,
            grams: typeof g === "number" ? g : null,
            noQuantity: r.noQuantity,
            food: food ? { ...food, group: food.group as FoodGroupKey } : null,
          };
        }),
        yieldPortions,
      ),
    [rows, catalog, yieldPortions],
  );

  // ── Payload y validación ──
  const payload = useMemo(() => {
    const num = (t: string) => {
      const v = parseNumber(t);
      return typeof v === "number" ? v : null;
    };
    const pub =
      origin === "IMPORT"
        ? {
            portionText: textOrNull(published.portionText),
            kcal: num(published.kcal),
            protein: num(published.protein),
            carbs: num(published.carbs),
            fat: num(published.fat),
            fiber: num(published.fiber),
          }
        : null;
    return {
      ...(recipe ? { id: recipe.id } : {}),
      name: name.trim(),
      type,
      moments,
      tags,
      yieldPortions,
      portionHousehold: textOrNull(portionHousehold),
      portionGrams: num(portionGramsText),
      preparation: textOrNull(preparation),
      tips: textOrNull(tips),
      sourceName: textOrNull(sourceName),
      published: pub,
      ingredients: rows
        .filter(rowHasContent)
        .map((r) => ({
          foodId: r.foodId,
          label: textOrNull(r.label),
          grams: r.noQuantity ? null : num(r.grams),
          noQuantity: r.noQuantity,
          household: textOrNull(r.household),
          rawText: r.rawText,
        })),
    };
  }, [recipe, name, type, moments, tags, yieldPortions, portionHousehold, portionGramsText, preparation, tips, sourceName, published, rows, origin]);

  // Filas con contenido, con su índice en `rows` (los errores de ingrediente se ubican por fila).
  const filledRowKeys = useMemo(
    () => rows.filter(rowHasContent).map((r) => r.key),
    [rows],
  );

  const localIssues = useMemo(() => {
    const out: { target: string; field: string; message: string }[] = [];
    for (const issue of validateRecipeForPublish({ ...payload, origin })) {
      if (issue.field === "ingredient") {
        const key = filledRowKeys[issue.index]!;
        const target = issue.message === RECIPE_TEXT.errIngredientEmpty ? `ing-${key}-food` : `ing-${key}-grams`;
        out.push({ target, field: `ingredient:${key}`, message: issue.message });
      } else {
        out.push({ target: FIELD_TARGET[issue.field]!, field: issue.field, message: issue.message });
      }
    }
    if (yieldValue === undefined && !out.some((i) => i.field === "yieldPortions")) {
      out.push({ target: FIELD_TARGET.yieldPortions!, field: "yieldPortions", message: BAD_NUMBER });
    }
    if (parseNumber(portionGramsText) === undefined) {
      out.push({ target: FIELD_TARGET.portionGrams!, field: "portionGrams", message: BAD_NUMBER });
    }
    for (const r of rows) {
      if (!r.noQuantity && parseNumber(r.grams) === undefined && !out.some((i) => i.field === `ingredient:${r.key}`)) {
        out.push({ target: `ing-${r.key}-grams`, field: `ingredient:${r.key}`, message: BAD_NUMBER });
      }
    }
    return out;
  }, [payload, origin, filledRowKeys, rows, yieldValue, portionGramsText]);

  const [tried, setTried] = useState(false);
  // Revisión: "Guardar borrador" solo exige números bien escritos; "Publicar" valida todo.
  const [attempt, setAttempt] = useState<"save" | "draft" | "publish">("save");
  const [pendingKind, setPendingKind] = useState<"save" | "draft" | "publish" | "discard" | null>(null);
  const [serverIssues, setServerIssues] = useState<RecipePublishIssue[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const issues = tried ? (attempt === "draft" ? localIssues.filter((i) => i.message === BAD_NUMBER) : localIssues) : [];
  const errorFor = (field: string) => issues.find((i) => i.field === field)?.message;

  // ── Cambios sin guardar ──
  const dirtyState = {
    payload,
    credit,
    photo: photoFile
      ? { name: photoFile.name, size: photoFile.size }
      : candidateId
        ? { name: `candidata:${candidateId}`, size: 0 }
        : null,
    removePhoto,
  };
  const snapshot = recipeFormSnapshot(dirtyState);
  const [baseline, setBaseline] = useState(snapshot);
  const dirty = snapshot !== baseline;
  const { guardNavigation } = useUnsavedChangesGuard(dirty && !pending, {
    title: "¿Salir sin guardar?",
    description: "Los cambios de esta receta se van a perder.",
    confirmLabel: "Salir sin guardar",
  });
  const usageKey = (p: typeof payload) => JSON.stringify({ i: p.ingredients, y: p.yieldPortions });
  const [usageBaseline] = useState(() => usageKey(payload));

  // ── "Más datos" ──
  const hasMoreData = Boolean(
    recipe?.preparation || recipe?.tips || recipe?.sourceName || (recipe?.tags.length ?? 0) > 0 || recipe?.published || recipe?.photo?.credit,
  );
  const [moreOpen, setMoreOpen] = useState(hasMoreData || origin === "IMPORT");
  useEffect(() => {
    if (errorFor("sourceName")) setMoreOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues.length]);

  // ── Foco ──
  const summaryRef = useRef<HTMLDivElement>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!focusTarget) return;
    focusById(focusTarget);
    setFocusTarget(null);
  }, [focusTarget]);

  function focusById(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const focusable = el.matches("input, textarea, button, select") ? el : el.querySelector<HTMLElement>("button, input");
    focusable?.focus();
    focusable?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  // Volver de "Crear alimento propio" (otra pestaña): recargar el catálogo.
  const refreshOnReturn = useRef(false);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && refreshOnReturn.current) {
        refreshOnReturn.current = false;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  // ── Ingredientes ──
  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    const row = emptyRow();
    setRows((rs) => [...rs, row]);
    setFocusTarget(`ing-${row.key}-food`);
  }
  function moveRow(index: number, dir: -1 | 1) {
    const key = rows[index]!.key;
    setRows((rs) => {
      const next = [...rs];
      const j = index + dir;
      if (j < 0 || j >= next.length) return rs;
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
    const j = index + dir;
    const stillMovable = dir === -1 ? j > 0 : j < rows.length - 1;
    setFocusTarget(`ing-${key}-${stillMovable ? (dir === -1 ? "up" : "down") : dir === -1 ? "down" : "up"}`);
  }
  function removeRow(index: number) {
    const next = rows[index + 1] ?? rows[index - 1];
    setRows((rs) => (rs.length === 1 ? [emptyRow()] : rs.filter((_, i) => i !== index)));
    setFocusTarget(next ? `ing-${next.key}-food` : "recipe-add-ingredient");
  }

  // ── Revisión: sugerencias de alimento (se calculan en el cliente, nunca se guardan solas) ──
  const suggestions = useMemo(() => {
    const out = new Map<string, RecipeCatalogFood>();
    if (!review) return out;
    for (const r of rows) {
      if (r.foodId || r.dismissed || r.label.trim() === "") continue;
      const hit = review.suggest(r.label);
      const food = hit ? catalog.get(hit.foodId) : undefined;
      if (food) out.set(r.key, food);
    }
    return out;
  }, [review, rows, catalog]);

  function acceptAllSuggestions() {
    const n = suggestions.size;
    setRows((rs) => rs.map((r) => (suggestions.has(r.key) ? { ...r, foodId: suggestions.get(r.key)!.id } : r)));
    notify.info(n === 1 ? "1 alimento aceptado" : `${n} alimentos aceptados`);
  }

  // ── Guardar / Guardar borrador / Publicar y seguir ──
  async function submit(kind: "save" | "draft" | "publish") {
    if (pending) return;
    setAttempt(kind);
    setTried(true);
    setServerIssues(null);
    setFormError(null);
    const blocking = kind === "draft" ? localIssues.filter((i) => i.message === BAD_NUMBER) : localIssues;
    if (blocking.length > 0) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    const warning = recipeUsageWarning(usage);
    if (kind === "save" && warning && usageKey(payload) !== usageBaseline) {
      const ok = await confirm({ title: "¿Guardar los cambios?", description: warning, confirmLabel: "Guardar igual", destructive: false });
      if (!ok) return;
    }
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    if (photoFile) fd.set("photo", photoFile);
    if (removePhoto) fd.set("removePhoto", "1");
    if (displayUrl) fd.set("photoCredit", credit);
    if (review) {
      if (candidateId) fd.set("candidateId", candidateId);
      if (review.file) fd.set("queueFile", review.file);
    }
    // Referencia para "sin guardar" una vez guardado: sin foto pendiente ni "Quitar foto" pendiente.
    const savedSnapshot = snapshotAfterSave(dirtyState);
    const removedPhotoId = removePhoto ? existingPhotoId : null;
    setPendingKind(kind);
    startTransition(async () => {
      const res =
        kind === "publish" && review
          ? await review.publish(fd)
          : kind === "draft" && review
            ? await review.saveDraft(fd)
            : await saveRecipeAction(fd);
      setPendingKind(null);
      if (res.ok) {
        setBaseline(savedSnapshot);
        setPhotoFile(null);
        setCandidateId(null);
        setRemovePhoto(false);
        if (removedPhotoId) setGonePhotoId(removedPhotoId);
        setTried(false);
        if (kind === "publish" && review) {
          notify.saved(RECIPE_TEXT.published);
          const nextId = "nextId" in res && typeof res.nextId === "string" ? res.nextId : null;
          router.push(reviewHref(nextId, review.file));
          return;
        }
        notify.saved(kind === "draft" ? "Borrador guardado" : RECIPE_TEXT.saved);
        if (!recipe) router.replace(`/recetas/${res.id}`);
        else router.refresh();
        return;
      }
      if (res.issues) {
        setServerIssues(res.issues);
        requestAnimationFrame(() => summaryRef.current?.focus());
      }
      if (res.photoError) {
        setPhotoError(res.photoError);
        if (res.id) {
          // La receta se guardó pero la foto no: se descarta la vista previa para no mostrar una foto que no está.
          setBaseline(savedSnapshot);
          setPhotoFile(null);
          setCandidateId(null);
          setPreviewUrl(null);
          setRemovePhoto(false);
          if (!recipe) router.replace(`/recetas/${res.id}?foto=error`);
          else router.refresh();
        }
      }
      if (res.error) {
        setFormError(res.error);
        notify.error(res.error);
      }
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // En la revisión no hay botón submit: Enter en un campo no publica por accidente.
    if (review) return;
    void submit("save");
  }

  async function onDiscard() {
    if (!review || !recipe || pending) return;
    const ok = await confirm({
      title: "¿Descartar el borrador?",
      description: "Se borra este borrador. Lo podés volver a extraer.",
      confirmLabel: "Descartar",
      destructive: true,
    });
    if (!ok) return;
    setPendingKind("discard");
    startTransition(async () => {
      const res = await review.discard(recipe.id, review.file);
      setPendingKind(null);
      if (!res.ok) {
        notify.error(res.error);
        return;
      }
      setBaseline(snapshot);
      notify.saved(RECIPE_TEXT.draftDiscarded);
      router.push(reviewHref(res.nextId, review.file));
    });
  }

  // Atajos de la revisión: funcionan aunque el foco esté en un campo (llevan Cmd/Ctrl).
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (!review) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void submitRef.current("publish");
      } else if (e.key.toLowerCase() === "s" && !e.shiftKey) {
        e.preventDefault();
        void submitRef.current("draft");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [review]);

  function onArchive() {
    if (!recipe) return;
    startArchive(async () => {
      const res = await archiveRecipeAction(recipe.id);
      if (!res.ok) {
        notify.error(res.error);
        return;
      }
      notify.undo(RECIPE_TEXT.archived, async () => {
        const undo = await unarchiveRecipeAction(recipe.id);
        if (undo.ok) router.refresh();
        else notify.error(undo.error);
      });
      router.refresh();
    });
  }

  function onUnarchive() {
    if (!recipe) return;
    startArchive(async () => {
      const res = await unarchiveRecipeAction(recipe.id);
      if (!res.ok) {
        notify.error(res.error);
        return;
      }
      notify.saved(RECIPE_TEXT.unarchived);
      router.refresh();
    });
  }

  const summaryItems = serverIssues
    ? serverIssues.map((i) => ({
        target: i.field === "ingredient" ? `ing-${filledRowKeys[i.index] ?? ""}-food` : FIELD_TARGET[i.field]!,
        message: i.message,
      }))
    : issues;
  const perPortion = macroResult.perPortion;
  const status = recipe?.status ?? null;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={cn(
        "pb-4",
        review
          ? "[&_:is(input,textarea,button,summary)]:scroll-mt-40"
          : "[&_:is(input,textarea,button,summary)]:scroll-mb-28",
      )}
    >
      {review ? (
        <>
          <ReviewBar
            review={review}
            saving={pendingKind === "draft"}
            publishing={pendingKind === "publish"}
            discarding={pendingKind === "discard"}
            kcalText={perPortion ? `${formatMacroAmount(perPortion.kcal, "kcal")} / porción` : ""}
            onNavigate={(href) => void guardNavigation(href)}
            onSave={() => void submit("draft")}
            onPublish={() => void submit("publish")}
            onDiscard={() => void onDiscard()}
          />
          <h1 className="sr-only">Revisar borrador: {recipe?.name}</h1>
        </>
      ) : (
        <PageHeader
          title={recipe ? recipe.name : "Nueva receta"}
          back={{ href: "/recetas", label: "Recetas" }}
          action={
            status ? <Badge tone={status === "PUBLISHED" ? "success" : "neutral"}>{RECIPE_STATUS_LABELS[status]}</Badge> : null
          }
        />
      )}

      {summaryItems.length > 0 ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="recipe-errors-title"
          className="mb-6 rounded-lg bg-destructive-muted px-4 py-3 text-callout focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <p id="recipe-errors-title" className="font-semibold text-destructive">
            {attempt === "publish"
              ? summaryItems.length === 1
                ? "Falta 1 dato para publicar"
                : `Faltan ${summaryItems.length} datos para publicar`
              : summaryItems.length === 1
                ? "Falta 1 dato para guardar"
                : `Faltan ${summaryItems.length} datos para guardar`}
          </p>
          <ul className="mt-1">
            {summaryItems.map((i, n) => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => focusById(i.target)}
                  className="min-h-11 text-left text-foreground underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-8 lg:items-start",
          review ? "lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,42rem)_20rem]",
        )}
      >
        {review ? (
          // Revisión: a la izquierda lo de referencia (macros + original), fijo mientras se edita.
          <div className="min-w-0 space-y-4 lg:sticky lg:top-[calc(var(--review-bar-h,7rem)+1rem)] lg:max-h-[calc(100dvh-var(--review-bar-h,7rem)-2rem)] lg:overflow-y-auto lg:pb-2">
            <RecipePortionSummary
              result={macroResult}
              yieldPortions={yieldPortions}
              published={recipe?.published ?? null}
              recipeName={name}
            />
            {isDesktop ? (
              <OriginalPanel original={review.original} />
            ) : (
              <details className="group rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-5 py-3 text-headline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="text-muted-foreground transition-transform duration-hover group-open:rotate-90">
                    ›
                  </span>
                  Ver original
                  <span className="text-callout font-normal text-muted-foreground">({review.original.label})</span>
                </summary>
                <div className="px-1 pb-1">
                  <OriginalPanel original={review.original} />
                </div>
              </details>
            )}
          </div>
        ) : null}
        <div className="min-w-0 space-y-8">
          {/* 1. Foto */}
          <section aria-label="Foto" className={review ? undefined : "max-w-md"}>
            <input
              ref={fileRef}
              id="recipe-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              onChange={onPickPhoto}
              aria-describedby="recipe-photo-help"
            />
            {review ? (
              <PhotoCandidates
                value={photoChoice}
                candidates={review.candidates}
                currentUrl={existingPhotoId ? recipePhotoUrl(existingPhotoId, "panel", "thumb") : null}
                uploadUrl={previewUrl}
                onChange={onPhotoChoice}
                onUpload={() => fileRef.current?.click()}
                recipeName={name}
              />
            ) : displayUrl ? (
              <div className="space-y-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                  <Image src={displayUrl} alt={`Foto de ${name || "la receta"}`} fill unoptimized sizes="28rem" className="object-cover" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="lg" onClick={() => fileRef.current?.click()}>
                    Cambiar foto
                  </Button>
                  <Button type="button" variant="ghost" size="lg" onClick={onRemovePhoto} className="text-destructive">
                    Quitar foto
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-describedby="recipe-photo-help"
                className="group relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed border-input bg-muted text-center press-sm hover:bg-overlay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {type ? (
                  <RecipePhoto photoUrl={null} type={type} alt="" sizes="28rem" className="absolute inset-0 opacity-40" />
                ) : null}
                <span className="relative flex flex-col items-center gap-2 px-6">
                  <Camera className="size-8 text-primary" strokeWidth={1.75} aria-hidden />
                  <span className="text-headline text-primary">Tocá para subir una foto</span>
                </span>
              </button>
            )}
            <p id="recipe-photo-help" className={cn("mt-2 text-footnote", photoError ? "text-destructive" : "text-muted-foreground")} role={photoError ? "alert" : undefined}>
              {photoError ?? "JPG, PNG o WebP, hasta 5 MB."}
            </p>
          </section>

          {/* 2. Nombre, tipo y momentos */}
          <section className="space-y-6">
            <div>
              <FieldLabel htmlFor="recipe-name">Nombre</FieldLabel>
              <Input
                id="recipe-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                autoComplete="off"
                placeholder="Albóndigas de lentejas…"
                aria-invalid={Boolean(errorFor("name")) || undefined}
                aria-describedby={errorFor("name") ? "recipe-name-error" : undefined}
                className="h-11 text-body"
              />
              <FieldError id="recipe-name-error" message={errorFor("name")} />
            </div>
            <div>
              <ChipGroup
                id="recipe-type"
                type="single"
                label="Tipo"
                labelPosition="top"
                options={TYPE_OPTIONS}
                value={type}
                onChange={(v) => setType(v as RecipeTypeKey | null)}
                invalid={Boolean(errorFor("type"))}
                describedBy={errorFor("type") ? "recipe-type-error" : undefined}
              />
              <FieldError id="recipe-type-error" message={errorFor("type")} />
            </div>
            <div>
              <ChipGroup
                id="recipe-moments"
                type="multiple"
                label="Momentos del día"
                labelPosition="top"
                options={MOMENT_OPTIONS}
                value={moments}
                onChange={(v) => setMoments(v as RecipeMomentKey[])}
                invalid={Boolean(errorFor("moments"))}
                describedBy={errorFor("moments") ? "recipe-moments-error" : undefined}
              />
              <FieldError id="recipe-moments-error" message={errorFor("moments")} />
            </div>
          </section>

          {/* 3. Rendimiento y porción */}
          <section className="space-y-4" aria-label="Rendimiento y porción">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="recipe-yield" className="text-body font-medium">
                  Rinde
                </label>
                <DecimalInput
                  id="recipe-yield"
                  value={yieldText}
                  onChange={setYieldText}
                  unit="porc."
                  className="w-32"
                  ariaLabel="Rinde (porciones)"
                  invalid={Boolean(errorFor("yieldPortions"))}
                  describedBy={errorFor("yieldPortions") ? "recipe-yield-error" : undefined}
                />
                <span className="text-body text-muted-foreground">porciones</span>
              </div>
              <FieldError id="recipe-yield-error" message={errorFor("yieldPortions")} />
            </div>
            <div>
              <FieldLabel htmlFor="recipe-portion">1 porción es</FieldLabel>
              <Input
                id="recipe-portion"
                value={portionHousehold}
                onChange={(e) => setPortionHousehold(e.target.value)}
                maxLength={80}
                placeholder="¾ albóndigas…"
                aria-invalid={Boolean(errorFor("portionHousehold")) || undefined}
                aria-describedby={errorFor("portionHousehold") ? "recipe-portion-error" : "recipe-portion-help"}
                className="h-11 text-body"
              />
              {errorFor("portionHousehold") ? (
                <FieldError id="recipe-portion-error" message={errorFor("portionHousehold")} />
              ) : (
                <p id="recipe-portion-help" className="mt-1.5 text-footnote text-muted-foreground">
                  En medida casera: es lo que lee el paciente.
                </p>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="recipe-portion-grams" className="text-body font-medium">
                  Pesa
                </label>
                <DecimalInput
                  id="recipe-portion-grams"
                  value={portionGramsText}
                  onChange={setPortionGramsText}
                  unit="g"
                  className="w-32"
                  ariaLabel="Peso de 1 porción en gramos (opcional)"
                  invalid={Boolean(errorFor("portionGrams"))}
                />
                <span className="text-callout text-muted-foreground">
                  (opcional)
                  {macroResult.estimatedPortionGrams ? (
                    <span className="tabular-nums"> · ≈ {macroResult.estimatedPortionGrams} g según los ingredientes</span>
                  ) : null}
                </span>
              </div>
              <FieldError id="recipe-portion-grams-error" message={errorFor("portionGrams")} />
            </div>
          </section>

          {/* 4. Ingredientes */}
          <section aria-labelledby="recipe-ingredients-title" className="space-y-3">
            <h2 id="recipe-ingredients-title" className="text-headline">
              Ingredientes
            </h2>
            {errorFor("ingredients") ? <FormError message={errorFor("ingredients")} /> : null}
            {review && suggestions.size > 0 ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-primary-soft/50 px-4 py-2">
                <p className="text-callout">
                  {suggestions.size === 1 ? "Hay 1 alimento sugerido." : `Hay ${suggestions.size} alimentos sugeridos.`} Revisalos antes de
                  aceptar.
                </p>
                <Button type="button" variant="tinted" size="lg" className="ml-auto" onClick={acceptAllSuggestions}>
                  {suggestions.size === 1 ? "Aceptar la sugerencia" : `Aceptar las ${suggestions.size} sugerencias`}
                </Button>
              </div>
            ) : null}
            <ol className="space-y-3">
              {rows.map((row, index) => (
                <IngredientRow
                  key={row.key}
                  row={row}
                  index={index}
                  count={rows.length}
                  food={row.foodId ? (catalog.get(row.foodId) ?? null) : null}
                  error={errorFor(`ingredient:${row.key}`)}
                  onChange={(patch) => updateRow(row.key, patch)}
                  onMove={(dir) => moveRow(index, dir)}
                  onRemove={() => removeRow(index)}
                  onCreateFood={() => {
                    refreshOnReturn.current = true;
                  }}
                  review={
                    review
                      ? {
                          suggestion: suggestions.get(row.key) ?? null,
                          flags: row.rawText ? review.flagsFor(row.rawText) : [],
                          onAccept: () => updateRow(row.key, { foodId: suggestions.get(row.key)?.id ?? null }),
                          onDismiss: () => updateRow(row.key, { dismissed: true }),
                          onChangeFood: () => focusById(`ing-${row.key}-food`),
                        }
                      : undefined
                  }
                />
              ))}
            </ol>
            <Button id="recipe-add-ingredient" type="button" variant="secondary" size="lg" className="w-full" onClick={addRow}>
              <Plus aria-hidden />
              Agregar ingrediente
            </Button>
          </section>

          {/* 6. Más datos */}
          <details
            open={moreOpen}
            onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}
            className="group rounded-xl bg-card shadow-card more-contrast:border more-contrast:border-input"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-5 py-3 text-headline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="text-muted-foreground transition-transform duration-hover group-open:rotate-90">
                ›
              </span>
              Más datos
              <span className="text-callout font-normal text-muted-foreground">(preparación, tips, etiquetas, fuente)</span>
            </summary>
            <div className="space-y-6 px-5 pb-5 pt-1">
              <div>
                <FieldLabel htmlFor="recipe-preparation">Preparación</FieldLabel>
                <Textarea id="recipe-preparation" rows={8} value={preparation} onChange={(e) => setPreparation(e.target.value)} className="text-body" />
              </div>
              <ChipGroup
                type="multiple"
                label="Etiquetas"
                labelPosition="top"
                options={TAG_OPTIONS}
                value={tags}
                onChange={(v) => setTags(v as RecipeTagKey[])}
              />
              <div>
                <FieldLabel htmlFor="recipe-tips">Tips y conservación</FieldLabel>
                <Textarea
                  id="recipe-tips"
                  rows={4}
                  value={tips}
                  onChange={(e) => setTips(e.target.value)}
                  placeholder={tags.includes("MEAL_PREP") ? "Se congela hasta 3 meses. Descongelar en heladera." : undefined}
                  aria-describedby={tags.includes("MEAL_PREP") && !tips.trim() ? "recipe-tips-help" : undefined}
                  className="text-body"
                />
                {tags.includes("MEAL_PREP") && !tips.trim() ? (
                  <p id="recipe-tips-help" className="mt-1.5 text-footnote text-muted-foreground">
                    Contá cómo se conserva.
                  </p>
                ) : null}
              </div>
              <div>
                <FieldLabel htmlFor="recipe-source">Fuente{origin === "IMPORT" ? "" : " (opcional)"}</FieldLabel>
                <Input
                  id="recipe-source"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  maxLength={300}
                  aria-invalid={Boolean(errorFor("sourceName")) || undefined}
                  aria-describedby={errorFor("sourceName") ? "recipe-source-error" : "recipe-source-help"}
                  className="h-11 text-body"
                />
                {errorFor("sourceName") ? (
                  <FieldError id="recipe-source-error" message={errorFor("sourceName")} />
                ) : (
                  <p id="recipe-source-help" className="mt-1.5 text-footnote text-muted-foreground">
                    Se muestra al paciente como «Fuente: …».
                  </p>
                )}
              </div>
              {displayUrl ? (
                <div>
                  <FieldLabel htmlFor="recipe-credit">Crédito de la foto (opcional)</FieldLabel>
                  <Input
                    id="recipe-credit"
                    value={credit}
                    onChange={(e) => setCredit(e.target.value)}
                    maxLength={200}
                    placeholder="Foto: …"
                    className="h-11 text-body"
                  />
                </div>
              ) : null}
              {origin === "IMPORT" ? (
                <fieldset className="space-y-3">
                  <legend className="mb-1.5 text-subheadline font-medium">Tabla del recetario (por porción, solo para comparar)</legend>
                  <Input
                    aria-label="Porción de la tabla"
                    value={published.portionText}
                    onChange={(e) => setPublished((p) => ({ ...p, portionText: e.target.value }))}
                    placeholder="1 porción…"
                    className="h-11 text-body"
                  />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {(
                      [
                        ["kcal", "Kcal", "kcal"],
                        ["protein", "Proteínas", "g"],
                        ["carbs", "Carbohidratos", "g"],
                        ["fat", "Grasas", "g"],
                        ["fiber", "Fibra", "g"],
                      ] as const
                    ).map(([key, label, unit]) => (
                      <div key={key}>
                        <FieldLabel htmlFor={`recipe-pub-${key}`}>{label}</FieldLabel>
                        <DecimalInput
                          id={`recipe-pub-${key}`}
                          value={published[key]}
                          onChange={(v) => setPublished((p) => ({ ...p, [key]: v }))}
                          unit={unit}
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </div>
          </details>
        </div>

        {/* 5. Aside: 1 porción aporta (abajo en el celular). En la revisión va a la izquierda. */}
        {review ? null : (
          <aside className="lg:sticky lg:top-6">
            <RecipePortionSummary
              result={macroResult}
              yieldPortions={yieldPortions}
              published={origin === "IMPORT" ? recipe?.published ?? null : null}
              recipeName={name}
            />
          </aside>
        )}
      </div>

      {/* 7. Barra inferior (en la revisión las acciones están en la barra de arriba) */}
      {review ? (
        formError ? (
          <div className="mt-6">
            <FormError message={formError} />
          </div>
        ) : null
      ) : (
      <div className="material-bar sticky bottom-0 z-10 -mx-6 mt-8 flex flex-wrap items-center gap-2 border-t px-6 py-3 lg:-mx-10 lg:px-10">
        <p className="mr-auto text-callout tabular-nums lg:hidden" aria-hidden>
          {perPortion ? `${formatMacroAmount(perPortion.kcal, "kcal")} / porción` : ""}
        </p>
        {formError ? <FormError message={formError} /> : null}
        <div className="ml-auto flex flex-wrap gap-2">
          {status === "PUBLISHED" ? (
            <Button type="button" variant="secondary" size="lg" onClick={onArchive} loading={archiving} disabled={pending}>
              Archivar
            </Button>
          ) : null}
          {status === "ARCHIVED" ? (
            <Button type="button" variant="secondary" size="lg" onClick={onUnarchive} loading={archiving} disabled={pending}>
              Volver a publicar
            </Button>
          ) : null}
          <Button type="submit" size="lg" loading={pending} disabled={archiving}>
            Guardar
          </Button>
        </div>
      </div>
      )}
    </form>
  );
}

function IngredientRow({
  row,
  index,
  count,
  food,
  error,
  onChange,
  onMove,
  onRemove,
  onCreateFood,
  review,
}: {
  row: Row;
  index: number;
  count: number;
  food: RecipeCatalogFood | null;
  error?: string;
  onChange: (patch: Partial<Row>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onCreateFood: () => void;
  review?: {
    suggestion: RecipeCatalogFood | null;
    flags: string[];
    onAccept: () => void;
    onDismiss: () => void;
    onChangeFood: () => void;
  };
}) {
  const id = (part: string) => `ing-${row.key}-${part}`;
  const grams = parseNumber(row.grams);
  const kcal =
    food && !row.noQuantity && typeof grams === "number" && grams > 0 ? computeItemMacros(food, grams).kcal : null;
  const showLabel = !food || row.showLabel || row.label.trim() !== "";
  const n = index + 1;
  const errorId = id("error");

  return (
    <li className="space-y-3 rounded-lg border bg-card p-3" aria-label={`Ingrediente ${n}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <IngredientFoodPicker
            id={id("food")}
            value={row.foodId}
            ariaLabel={`Alimento del ingrediente ${n}`}
            invalid={Boolean(error) && !row.foodId && !row.label.trim()}
            describedBy={error ? errorId : undefined}
            onChange={(f) => onChange({ foodId: f?.id ?? null, showLabel: f ? row.showLabel : true })}
          />
        </div>
        <p className="mt-3 w-20 shrink-0 text-right text-footnote tabular-nums text-muted-foreground" aria-live="polite">
          {kcal !== null ? formatMacroAmount(kcal, "kcal") : "—"}
        </p>
      </div>

      {review ? (
        <SuggestionLine
          rawText={row.rawText}
          suggestion={review.suggestion ? { name: review.suggestion.name, grams: row.noQuantity ? "" : row.grams } : null}
          onAccept={review.onAccept}
          onChangeFood={review.onChangeFood}
          onDismiss={review.onDismiss}
        />
      ) : null}

      {showLabel ? (
        <div>
          <label htmlFor={id("label")} className="mb-1 block text-footnote font-medium text-muted-foreground">
            {food ? "Cómo se lee en la receta" : "Ingrediente"}
          </label>
          <Input
            id={id("label")}
            value={row.label}
            onChange={(e) => onChange({ label: e.target.value })}
            maxLength={200}
            placeholder={food ? `${food.name.split(",")[0]}…` : "Pan rallado…"}
            className="h-11 text-body"
          />
          {!food ? (
            <p className="mt-1.5 text-footnote text-muted-foreground">
              Sin alimento: no suma macros ·{" "}
              <Link
                href="/alimentos/nuevo"
                target="_blank"
                rel="noopener"
                onClick={onCreateFood}
                className="inline-flex min-h-11 items-center gap-1 text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Crear alimento propio
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(se abre en otra pestaña)</span>
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <Button type="button" variant="plain" size="sm" className="h-11 px-0" onClick={() => onChange({ showLabel: true })}>
          Cambiar cómo se lee
        </Button>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={id("grams")} className="mb-1 block text-footnote font-medium text-muted-foreground">
            Gramos
          </label>
          <DecimalInput
            id={id("grams")}
            value={row.noQuantity ? "" : row.grams}
            onChange={(v) => onChange({ grams: v })}
            unit="g"
            className="w-32"
            disabled={row.noQuantity}
            invalid={Boolean(error) && Boolean(row.foodId || row.grams)}
            describedBy={error ? errorId : undefined}
          />
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor={id("household")} className="mb-1 block text-footnote font-medium text-muted-foreground">
            Medida casera
          </label>
          <Input
            id={id("household")}
            value={row.household}
            onChange={(e) => onChange({ household: e.target.value })}
            maxLength={120}
            placeholder="1 taza…"
            className="h-11 text-body"
          />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-callout">
          <Checkbox
            checked={row.noQuantity}
            onCheckedChange={(c) => onChange({ noQuantity: c === true, grams: c === true ? "" : row.grams })}
          />
          Sin cantidad (c.n.)
        </label>
      </div>
      {review && review.flags.length > 0 ? (
        <ul className="space-y-0.5 text-footnote text-warning" aria-label={`Avisos del ingrediente ${n}`}>
          {review.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      <FieldError id={errorId} message={error} />

      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        <Button
          id={id("up")}
          type="button"
          variant="ghost"
          size="lg"
          className="px-3"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={`Subir ingrediente ${n}`}
        >
          <ArrowUp aria-hidden />
          Subir
        </Button>
        <Button
          id={id("down")}
          type="button"
          variant="ghost"
          size="lg"
          className="px-3"
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          aria-label={`Bajar ingrediente ${n}`}
        >
          <ArrowDown aria-hidden />
          Bajar
        </Button>
        <Button type="button" variant="ghost" size="lg" className="ml-auto px-3 text-destructive" onClick={onRemove}>
          Quitar
        </Button>
      </div>
    </li>
  );
}
