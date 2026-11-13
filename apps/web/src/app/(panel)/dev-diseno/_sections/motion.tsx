"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { animateSingleValue, m, useMotionValue, useReducedMotionConfig, type MotionValue } from "motion/react";
import { fades, projectMomentum, rubberband, springs } from "@/lib/motion";
import { DemoLabel, DemoSection } from "./section";

const SQUARE = 40; // px: tamaño visual del cuadrado de cada preset

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function PresetTrack({ name }: { name: keyof typeof springs }) {
  const [at, setAt] = useState<"start" | "end">("start");
  const [ref, width] = useWidth<HTMLDivElement>();
  const reduced = useReducedMotionConfig();
  const preset = springs[name];
  const x = at === "end" ? Math.max(0, width - SQUARE) : 0;

  return (
    <div className="grid items-center gap-3 sm:grid-cols-[10rem_1fr_auto]">
      <div className="text-footnote">
        <p className="font-semibold">{name}</p>
        <p className="tabular-nums text-muted-foreground">
          bounce {preset.bounce} · {preset.visualDuration} s
        </p>
      </div>
      <div ref={ref} className="relative h-10 rounded-full bg-secondary">
        <m.div
          className="absolute left-0 top-0 size-10 rounded-full bg-primary shadow-thumb"
          animate={reduced ? { x, opacity: [0.4, 1] } : { x }}
          transition={reduced ? fades.fast : preset}
        />
      </div>
      <button
        type="button"
        onClick={() => setAt((a) => (a === "start" ? "end" : "start"))}
        className="relative h-8 rounded-md bg-secondary px-3 text-subheadline font-medium press touch-target hover:bg-fill-hover pressed:bg-fill-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Mover
      </button>
    </div>
  );
}

const BALL = 48;

/** Pelota arrastrable: 1:1 respetando el punto de agarre, rubber-band en los bordes y proyección al soltar. */
function MomentumPlayground() {
  const [ref, width] = useWidth<HTMLDivElement>();
  const x = useMotionValue(0);
  const [ghost, setGhost] = useState<number | null>(null);
  const drag = useRef<{ startX: number; startValue: number } | null>(null);
  const max = Math.max(0, width - BALL);
  const snaps = [0, max / 2, max];

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    x.stop(); // agarrar en vuelo: toma el valor presente (§3)
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startValue: x.get() };
    setGhost(null);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const raw = drag.current.startValue + (e.clientX - drag.current.startX);
    if (raw < 0) x.set(-rubberband(-raw, width));
    else if (raw > max) x.set(max + rubberband(raw - max, width));
    else x.set(raw);
  }
  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    const velocity = x.getVelocity();
    const projected = x.get() + projectMomentum(velocity);
    const target = snaps.reduce((best, s) => (Math.abs(s - projected) < Math.abs(best - projected) ? s : best), 0);
    setGhost(Math.max(-BALL / 2, Math.min(max + BALL / 2, projected)));
    animateSingleValue(x, target, { ...springs.fling, velocity });
  }

  return (
    <div>
      <DemoLabel>Arrastrar y soltar con impulso: rubber-band contra los bordes, proyección de momentum y spring con la velocidad del dedo</DemoLabel>
      <div ref={ref} className="relative h-20 rounded-2xl bg-secondary">
        {snaps.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-tertiary"
            style={{ left: s + BALL / 2 - 4 }}
          />
        ))}
        {ghost !== null ? (
          <span
            aria-hidden
            className="absolute top-4 size-12 rounded-full border-2 border-dashed border-primary/50"
            style={{ left: ghost }}
          />
        ) : null}
        <Ball x={x} handlers={{ onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }} />
      </div>
      <p className="mt-2 text-footnote text-muted-foreground">
        El círculo punteado es el destino proyectado (d = 0,998); la pelota va al punto de anclaje más cercano a esa
        proyección.
      </p>
    </div>
  );
}

function Ball({
  x,
  handlers,
}: {
  x: MotionValue<number>;
  handlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
}) {
  return (
    <m.div
      {...handlers}
      role="img"
      aria-label="Pelota arrastrable"
      style={{ x, touchAction: "none" }}
      className="absolute left-0 top-4 size-12 cursor-grab rounded-full bg-primary shadow-thumb active:cursor-grabbing"
    />
  );
}

export function MotionSection() {
  return (
    <DemoSection
      id="movimiento"
      index={5}
      title="Movimiento"
      description="Springs críticamente amortiguados por defecto; rebote solo después de un gesto con impulso. Tocá «Mover» otra vez a mitad de camino: invierte desde donde está, sin frenazo."
    >
      <div className="space-y-8">
        <div className="space-y-4 rounded-xl bg-card p-5 shadow-card">
          {(Object.keys(springs) as (keyof typeof springs)[]).map((name) => (
            <PresetTrack key={name} name={name} />
          ))}
        </div>
        <MomentumPlayground />
      </div>
    </DemoSection>
  );
}
