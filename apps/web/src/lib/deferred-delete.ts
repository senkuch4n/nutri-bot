"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { notify } from "@/lib/notify";

// HU-017c-3 (D12a): borrado diferido con "Deshacer". Al confirmar, el dato se oculta al instante y el
// borrado real (la server action) corre recién cuando vence el toast de 8 s o se cierra. Si se
// recarga o se cierra la pestaña antes, no se borra nada (falla del lado seguro).
//
// Dos capas: un store puro (testeable en node, sin DOM) y los hooks de React.

export type CommitResult = { ok: boolean; error?: string };

export interface DeferredDeleteStore {
  /** Oculta `key` al instante y deja el borrado pendiente. Devuelve el id de la entrada.
   *  `guardUnload` (HU-017b-1, default false): cuenta para `hasGuardedPending` (aviso al cerrar). */
  schedule(entry: { key: string; commit: () => Promise<CommitResult>; guardUnload?: boolean }): string;
  /** Deshace: saca `key` de los pendientes sin llamar a commit. true si llegó a tiempo. */
  undo(id: string): boolean;
  /** Ejecuta commit (una sola vez por entrada). Si falla, vuelve a mostrar `key` y devuelve el error. */
  commit(id: string): Promise<CommitResult>;
  isPending(key: string): boolean;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ReadonlySet<string>;
  /** HU-017b-1: true si hay alguna entrada con guardUnload en estado "pending" o "committing". */
  hasGuardedPending(): boolean;
}

export interface DeferredDeleteStoreOptions {
  /**
   * Después de un commit exitoso la key sigue oculta este tiempo y recién después se libera. Así el
   * dato no reaparece entre que la action responde y llega la página revalidada, y una key que se
   * puede volver a usar no queda oculta para siempre.
   */
  releaseAfterMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
}

type EntryState = "pending" | "committing" | "done" | "undone";
type Entry = {
  key: string;
  commit: () => Promise<CommitResult>;
  state: EntryState;
  guardUnload: boolean;
  result?: Promise<CommitResult>;
};

const SKIPPED: CommitResult = { ok: true };

/** Cada entrada se resuelve UNA vez (lo primero entre undo y commit gana; el resto es no-op). */
export function createDeferredDeleteStore(options: DeferredDeleteStoreOptions = {}): DeferredDeleteStore {
  const releaseAfterMs = options.releaseAfterMs ?? 10_000;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let counter = 0;
  let snapshot: ReadonlySet<string> = new Set();

  // La snapshot es inmutable: useSyncExternalStore compara por identidad.
  function recompute() {
    const hidden = new Set<string>();
    for (const e of entries.values()) {
      if (e.state === "pending" || e.state === "committing" || e.state === "done") hidden.add(e.key);
    }
    snapshot = hidden;
    for (const l of listeners) l();
  }

  return {
    schedule({ key, commit, guardUnload = false }) {
      counter += 1;
      const id = `${key}#${counter}`;
      entries.set(id, { key, commit, state: "pending", guardUnload });
      recompute();
      return id;
    },
    undo(id) {
      const entry = entries.get(id);
      if (!entry || entry.state !== "pending") return false;
      entry.state = "undone";
      entries.delete(id);
      recompute();
      return true;
    },
    commit(id) {
      const entry = entries.get(id);
      if (!entry) return Promise.resolve(SKIPPED);
      if (entry.result) return entry.result;
      if (entry.state !== "pending") return Promise.resolve(SKIPPED);
      entry.state = "committing";
      entry.result = (async (): Promise<CommitResult> => {
        let result: CommitResult;
        try {
          result = await entry.commit();
        } catch (error) {
          result = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
        if (result.ok) {
          entry.state = "done";
          setTimer(() => {
            entries.delete(id);
            recompute();
          }, releaseAfterMs);
        } else {
          // Falló: el dato vuelve a verse.
          entries.delete(id);
        }
        recompute();
        return result;
      })();
      return entry.result;
    },
    isPending(key) {
      return snapshot.has(key);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    // pending → committing no cambia ni las keys ocultas ni este valor (los dos estados cuentan), así
    // que no hace falta avisar ahí; schedule, undo y el fin del commit ya llaman a recompute.
    hasGuardedPending() {
      for (const e of entries.values()) {
        if (e.guardUnload && (e.state === "pending" || e.state === "committing")) return true;
      }
      return false;
    },
  };
}

/** Store único del panel (módulo cliente). En el servidor nunca se programa nada. */
export const deferredDeletes: DeferredDeleteStore = createDeferredDeleteStore();

const EMPTY: ReadonlySet<string> = new Set();
const getServerSnapshot = () => EMPTY;

/** Hook: todas las keys pendientes (para filtrar listas). */
export function usePendingDeletions(): ReadonlySet<string> {
  return useSyncExternalStore(deferredDeletes.subscribe, deferredDeletes.getSnapshot, getServerSnapshot);
}

/** Hook: ¿esta key está pendiente de borrado? (useSyncExternalStore). */
export function usePendingDeletion(key: string): boolean {
  return usePendingDeletions().has(key);
}

/** Textos del borrado diferido que no viven en core (los de ISAK y calorías están en core). */
export const UNDO_TEXT = {
  deleteError: "No se pudo borrar. Probá de nuevo.",
  undoError: "No se pudo deshacer.",
  open: "Abrir",
  consultation: {
    confirmTitle: "¿Borrar esta consulta?",
    /** day = "24/09". */
    confirmDescription: (day: string) =>
      `Se borra la consulta del ${day}. Solo se puede borrar si no tiene mediciones, cálculo ni plan.`,
    confirmLabel: "Borrar consulta",
    deleted: "Consulta borrada",
    undone: "Listo, la consulta volvió",
  },
  study: { undone: "Listo, el estudio volvió" },
  calculation: { confirmLabel: "Borrar cálculo", undone: "Listo, el cálculo volvió" },
  measurement: {
    confirmTitle: "¿Borrar esta medición?",
    /** "Se borra la medición del 24/09 (peso, cintura…)." · sin valores: "Se borra la medición del 24/09." */
    confirmDescription: (day: string, labels: readonly string[]) =>
      `Se borra la medición del ${day}${measurementLabelsText(labels)}.`,
    confirmLabel: "Borrar medición",
    deleted: "Medición borrada",
    undone: "Listo, la medición volvió",
  },
  plan: { removed: "Plan quitado de la consulta", undone: "Listo, el plan volvió" },
  moreOptions: "Más opciones",
} as const;

/** " (peso, cintura…)": hasta 2 rótulos en minúscula; "…" si hay más. Vacío → "". */
export function measurementLabelsText(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  const shown = labels.slice(0, 2).map((l) => l.toLowerCase());
  return ` (${shown.join(", ")}${labels.length > 2 ? "…" : ""})`;
}

/**
 * Key del borrado diferido de un cálculo (ronda 2 de 017c-4): va por el id de la prescripción, no por
 * la consulta. Así, durante `releaseAfterMs`, la key vieja oculta solo el cálculo borrado y nunca uno
 * nuevo (que tiene otro id). Sin prescripción → una key que nunca se programa.
 */
export function prescriptionDeletionKey(prescriptionId: string | null): string {
  return `prescription:${prescriptionId ?? ""}`;
}

export type DeferredDeleteOptions = {
  /** `consultation:<id>`, `isak:<entryId>`, `prescriptionDeletionKey(<prescriptionId>)`, `measurement:<entryId>`. */
  key: string;
  /** "Estudio borrado". */
  message: string;
  /** "Listo, el estudio volvió". */
  undoneMessage: string;
  commit: () => Promise<CommitResult>;
  /** P. ej. navegar a la ficha al borrar la consulta. */
  afterSchedule?: () => void;
  /** "Abrir" la consulta restaurada. */
  undoneAction?: { label: string; href: string };
  /** HU-017b-1 (T10): avisa con beforeunload mientras esté pendiente o enviándose. */
  guardUnload?: boolean;
  /** HU-017b-1: toast si el commit falla. Default UNDO_TEXT.deleteError. */
  errorMessage?: string;
  /** HU-017b-1: corre después de un commit exitoso (además de router.refresh()). P. ej. refetch del calendario. */
  onCommitted?: () => void;
};

/**
 * Orquesta confirmación ya hecha → schedule → toast con "Deshacer" (8 s). Vence o se cierra el
 * toast → commit. "Deshacer" → undo + "Listo, … volvió". Si commit falla → toast de error y el dato
 * vuelve a verse; si sale bien → router.refresh().
 */
export function useDeferredDelete(): (opts: DeferredDeleteOptions) => void {
  const router = useRouter();
  return useCallback(
    (opts: DeferredDeleteOptions) => {
      const id = deferredDeletes.schedule({ key: opts.key, commit: opts.commit, guardUnload: opts.guardUnload });
      // onAutoClose y onDismiss pueden llegar los dos: se atiende solo la primera resolución.
      let settled = false;
      notify.undo(
        opts.message,
        () => {
          if (settled) return;
          settled = true;
          if (!deferredDeletes.undo(id)) return;
          const action = opts.undoneAction;
          notify.saved(
            opts.undoneMessage,
            action ? { action: { label: action.label, onClick: () => router.push(action.href) } } : undefined,
          );
        },
        {
          onExpire: () => {
            if (settled) return;
            settled = true;
            void deferredDeletes.commit(id).then((result) => {
              if (result.ok) {
                router.refresh();
                opts.onCommitted?.();
              } else notify.error(opts.errorMessage ?? UNDO_TEXT.deleteError);
            });
          },
        },
      );
      opts.afterSchedule?.();
    },
    [router],
  );
}
