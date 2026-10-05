"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useConfirm, type ConfirmOptions } from "@/components/confirm";

/**
 * HU-007: avisa antes de salir de una página con cambios sin guardar.
 * - Cerrar la pestaña o recargar: `beforeunload` (el texto lo pone el navegador).
 * - Clic en un link interno (menú, breadcrumbs, avisos): se intercepta en captura y se pide
 *   confirmación con `useConfirm`. Si confirma, navega con el router.
 * - El botón "atrás" del navegador no se intercepta (limitación conocida).
 * `confirm` se llama siempre desde un handler, nunca dentro de una transición ni de un <form action>.
 */
export function useUnsavedChangesGuard(
  dirty: boolean,
  /** `cancelLabel` (HU-017b-2, opcional): texto de la opción segura ("Seguir editando"). */
  confirmOptions: { title: string; description: string; confirmLabel: string; cancelLabel?: string },
): { guardNavigation: (href: string) => Promise<void> } {
  const confirm = useConfirm();
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const optionsRef = useRef<ConfirmOptions>({ ...confirmOptions, destructive: true });
  optionsRef.current = { ...confirmOptions, destructive: true };

  const guardNavigation = useCallback(
    async (href: string) => {
      if (dirtyRef.current && !(await confirm(optionsRef.current))) return;
      router.push(href);
    },
    [confirm, router],
  );

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      const href = `${url.pathname}${url.search}${url.hash}`;
      void (async () => {
        if (await confirm(optionsRef.current)) router.push(href);
      })();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, confirm, router]);

  return { guardNavigation };
}
