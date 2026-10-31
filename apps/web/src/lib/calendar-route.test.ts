import { describe, expect, it } from "vitest";
import type { CalendarView } from "@nutri-bot/core";
import {
  CALENDAR_VIEWS,
  FC_VIEW,
  REVEAL_MAX_DELAY_MS,
  calendarHref,
  calendarRevealDelayMs,
  createCalendarReveal,
  calendarRouteQuery,
  calendarViewFromFc,
  defaultCalendarView,
  resolveCalendarRoute,
} from "./calendar-route";

const todayKey = "2026-10-05";
const narrow = { todayKey, wide: false };
const wide = { todayKey, wide: true };

describe("resolveCalendarRoute", () => {
  it("sin parámetros: hoy y la vista por ancho", () => {
    expect(resolveCalendarRoute({ fecha: null, vista: null }, narrow)).toEqual({ view: "dia", dayKey: todayKey });
    expect(resolveCalendarRoute({ fecha: null, vista: null }, wide)).toEqual({ view: "mes", dayKey: todayKey });
  });

  it("?fecha= sin vista abre ese día en Día, en cualquier ancho", () => {
    expect(resolveCalendarRoute({ fecha: "2026-10-08", vista: null }, wide)).toEqual({ view: "dia", dayKey: "2026-10-08" });
    expect(resolveCalendarRoute({ fecha: "2026-10-08", vista: null }, narrow)).toEqual({ view: "dia", dayKey: "2026-10-08" });
  });

  it.each(["2026-13-40", "mañana", "", "2026-02-30"])("fecha inválida %j → hoy y vista por ancho, sin error", (fecha) => {
    expect(resolveCalendarRoute({ fecha, vista: null }, wide)).toEqual({ view: "mes", dayKey: todayKey });
    expect(resolveCalendarRoute({ fecha, vista: null }, narrow)).toEqual({ view: "dia", dayKey: todayKey });
  });

  it("?vista= válida manda; inválida se ignora", () => {
    expect(resolveCalendarRoute({ fecha: null, vista: "mes" }, narrow)).toEqual({ view: "mes", dayKey: todayKey });
    expect(resolveCalendarRoute({ fecha: null, vista: "SEMANA" }, wide)).toEqual({ view: "mes", dayKey: todayKey });
    expect(resolveCalendarRoute({ fecha: null, vista: "xyz" }, narrow)).toEqual({ view: "dia", dayKey: todayKey });
    expect(resolveCalendarRoute({ fecha: "2026-10-08", vista: "semana" }, narrow)).toEqual({
      view: "semana",
      dayKey: "2026-10-08",
    });
  });
});

describe("calendarRouteQuery", () => {
  it("query canónica", () => {
    expect(calendarRouteQuery({ view: "mes", dayKey: todayKey }, wide).toString()).toBe("");
    expect(calendarRouteQuery({ view: "dia", dayKey: todayKey }, narrow).toString()).toBe("");
    expect(calendarRouteQuery({ view: "semana", dayKey: todayKey }, wide).toString()).toBe("vista=semana");
    expect(calendarRouteQuery({ view: "semana", dayKey: "2026-10-08" }, wide).toString()).toBe(
      "fecha=2026-10-08&vista=semana",
    );
    expect(calendarRouteQuery({ view: "dia", dayKey: "2026-10-08" }, wide).toString()).toBe(
      "fecha=2026-10-08&vista=dia",
    );
  });

  it("ida y vuelta: resolve(query(s)) === s", () => {
    for (const view of CALENDAR_VIEWS) {
      for (const dayKey of [todayKey, "2026-10-08"]) {
        for (const ctx of [wide, narrow]) {
          const q = calendarRouteQuery({ view, dayKey }, ctx);
          expect(resolveCalendarRoute({ fecha: q.get("fecha"), vista: q.get("vista") }, ctx)).toEqual({ view, dayKey });
        }
      }
    }
  });
});

describe("calendarHref", () => {
  it("conserva otros parámetros y el hash; reemplaza fecha/vista viejos", () => {
    const href = calendarHref("http://x/?foo=1&fecha=2026-01-01&vista=mes#h", { view: "dia", dayKey: "2026-10-08" }, wide);
    const url = new URL(href);
    expect(url.searchParams.get("foo")).toBe("1");
    expect(url.searchParams.get("fecha")).toBe("2026-10-08");
    expect(url.searchParams.get("vista")).toBe("dia");
    expect(url.hash).toBe("#h");
  });
  it("hoy con la vista por defecto deja la URL limpia", () => {
    expect(calendarHref("http://x/?fecha=2026-10-08&vista=dia", { view: "mes", dayKey: todayKey }, wide)).toBe("http://x/");
  });
});

describe("vistas de FullCalendar", () => {
  it("ida y vuelta, y desconocida → semana", () => {
    for (const view of CALENDAR_VIEWS) expect(calendarViewFromFc(FC_VIEW[view])).toBe(view as CalendarView);
    expect(calendarViewFromFc("listWeek")).toBe("semana");
  });
  it("vista por ancho", () => {
    expect(defaultCalendarView(true)).toBe("mes");
    expect(defaultCalendarView(false)).toBe("dia");
  });
});

describe("calendarRevealDelayMs (entrada del calendario)", () => {
  it("escalona las pastillas en orden y frena en el tope (un mes cargado no tarda de más)", () => {
    expect(calendarRevealDelayMs(0)).toBe(0);
    expect(calendarRevealDelayMs(1)).toBe(40);
    expect(calendarRevealDelayMs(5)).toBe(200);
    expect(calendarRevealDelayMs(500)).toBe(REVEAL_MAX_DELAY_MS);
  });
});

describe("createCalendarReveal", () => {
  function manualScheduler() {
    const queue: Array<() => void> = [];
    return { schedule: (fn: () => void) => void queue.push(fn), flush: () => queue.splice(0).forEach((fn) => fn()) };
  }

  it("sigue activa hasta que se monta la primera tanda de pastillas (el eventsSet vacío del inicio no la cierra)", () => {
    const s = manualScheduler();
    const reveal = createCalendarReveal(s.schedule);
    s.flush(); // pasa el tiempo antes de que lleguen los turnos
    expect(reveal.next()).toBe(0);
    expect(reveal.next()).toBe(40);
    expect(reveal.next()).toBe(80);
  });

  it("después de la primera tanda, las pastillas nuevas (refresco, otro mes) entran sin animación", () => {
    const s = manualScheduler();
    const reveal = createCalendarReveal(s.schedule);
    reveal.next();
    reveal.next();
    s.flush();
    expect(reveal.next()).toBeNull();
  });
});
