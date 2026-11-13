"use client";

import { CircleAlert } from "lucide-react";
import { PORTAL_TEXT } from "@nutri-bot/core";
import { StatusScreen } from "@/components/status-screen";
import { Button, ButtonLink } from "@/components/ui";

// HU-017d-1 (T10): textos simples y sin "Código: …".
export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusScreen
      icon={CircleAlert}
      title={PORTAL_TEXT.errorTitle}
      description={PORTAL_TEXT.errorBody}
      actions={
        <>
          <Button size="lg" onClick={reset}>
            {PORTAL_TEXT.retry}
          </Button>
          <ButtonLink href="/portal" variant="secondary" size="lg">
            {PORTAL_TEXT.backHome}
          </ButtonLink>
        </>
      }
    />
  );
}
