"use client";

// HU-029b (§B.6.4 P2): al volver del checkout (?mp=volver) no se confía en la URL: se consulta el estado
// (refreshSubscriptionAction, que consulta MP como mucho cada 3 s) hasta 60 s.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { SUBSCRIPTION_TEXT as T } from "@nutri-bot/core";
import { Button } from "@/components/ui";
import { refreshSubscriptionAction } from "./actions";

const INTERVAL_MS = 3_000;
const MAX_MS = 60_000;

export function SubscriptionConfirming() {
  const router = useRouter();
  const [delayed, setDelayed] = useState(false);
  const started = useRef(Date.now());

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      if (Date.now() - started.current >= MAX_MS) {
        setDelayed(true);
        return;
      }
      try {
        const { status, authorized } = await refreshSubscriptionAction();
        if (stopped) return;
        if ((status !== null && status !== "PENDING") || authorized) {
          router.replace("/ajustes/suscripcion");
          return;
        }
      } catch {
        // Red caída: se sigue intentando hasta el tope.
      }
      timer = setTimeout(tick, INTERVAL_MS);
    };
    timer = setTimeout(tick, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [router]);

  if (delayed) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-body">{T.confirmDelayed}</p>
        <Button variant="secondary" onClick={() => router.refresh()}>
          {T.refresh}
        </Button>
      </div>
    );
  }
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-3 text-body">
      <LoaderCircle className="size-5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
      {T.confirming}
    </p>
  );
}
