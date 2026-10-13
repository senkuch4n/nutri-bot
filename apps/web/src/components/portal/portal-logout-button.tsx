"use client";

import { useRef } from "react";
import { LogOut } from "lucide-react";
import { PORTAL_TEXT } from "@nutri-bot/core";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui";

/** HU-017d-1 (D9): "Salir del portal", al final del inicio. Pregunta y hace el mismo POST de siempre. */
export function PortalLogoutButton() {
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);

  // El confirm va en onClick, fuera de cualquier action/transición (ver la nota de useConfirm).
  async function handleClick() {
    const ok = await confirm({
      title: PORTAL_TEXT.logoutConfirmTitle,
      description: PORTAL_TEXT.logoutConfirmBody,
      confirmLabel: PORTAL_TEXT.logoutConfirm,
      cancelLabel: PORTAL_TEXT.logoutCancel,
      destructive: true,
    });
    if (ok) formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action="/portal/logout" method="POST" hidden />
      <Button type="button" variant="plain" size="lg" className="w-full text-muted-foreground" onClick={handleClick}>
        <LogOut aria-hidden />
        {PORTAL_TEXT.logout}
      </Button>
    </>
  );
}
