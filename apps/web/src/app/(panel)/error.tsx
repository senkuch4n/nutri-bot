"use client";

import { CircleAlert } from "lucide-react";
import { StatusScreen } from "@/components/status-screen";
import { Button, ButtonLink } from "@/components/ui";

export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <StatusScreen
      icon={CircleAlert}
      title="Algo salió mal"
      description="No pudimos mostrar esta pantalla. Probá de nuevo y, si sigue fallando, recargá la página."
      actions={
        <>
          <Button onClick={reset}>Reintentar</Button>
          <ButtonLink href="/" variant="secondary">
            Volver al calendario
          </ButtonLink>
        </>
      }
      detail={error.digest ? `Código: ${error.digest}` : undefined}
    />
  );
}
