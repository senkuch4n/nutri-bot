"use client";

import { useState } from "react";
import { BroadcastForm } from "../avisos/broadcast-form";
import type { BroadcastState } from "../avisos/actions";
import { DemoSection } from "./_sections/section";

/**
 * HU-017b-3 (Q18): el camino "vencer" del comunicado sin base ni WhatsApp. El `sendAction` falso se
 * define acá, en un componente cliente (nunca desde el servidor, T9a): no encola nada y solo cuenta.
 */
export function BroadcastDemoSection({ index }: { index: number }) {
  const [calls, setCalls] = useState<string[]>([]);
  const fakeSend = async (_prev: BroadcastState, formData: FormData): Promise<BroadcastState> => {
    const body = String(formData.get("body") ?? "");
    await new Promise((r) => setTimeout(r, 400));
    setCalls((c) => [...c, body]);
    return { ok: true, sent: 12 };
  };
  return (
    <DemoSection
      id="comunicado"
      index={index}
      title="Comunicado con Deshacer"
      description="Demo sin base: el envío es falso. Revisá, enviá y dejá vencer (o deshacé) el toast de 8 segundos."
    >
      <BroadcastForm patientCount={12} sendAction={fakeSend} />
      <p className="mt-3 text-footnote text-muted-foreground" role="status" data-broadcast-demo-calls={calls.length}>
        Envíos falsos que corrieron: {calls.length}
        {calls.length ? ` (último: “${calls[calls.length - 1]}”)` : ""}
      </p>
    </DemoSection>
  );
}
