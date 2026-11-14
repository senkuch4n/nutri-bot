// HU-022: reloj de "Cambiar horario" (HTML estático, sin DOM ni base).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { groupRescheduleSlots } from "@nutri-bot/core";

vi.mock("@/app/(panel)/actions", () => ({
  getRescheduleSlotsAction: vi.fn(),
  rescheduleAppointmentAction: vi.fn(),
}));

import { RescheduleClock, type RescheduleMode, type RescheduleSelection } from "./reschedule-dialog";

const tz = "America/Argentina/Buenos_Aires";
// Jueves 5 de noviembre de 2026: libres 9:00, 9:30 y 14:45.
const groups = groupRescheduleSlots(
  ["2026-11-05T12:00:00.000Z", "2026-11-05T12:30:00.000Z", "2026-11-05T17:45:00.000Z"],
  tz,
);

const render = (mode: RescheduleMode, selection: RescheduleSelection | null, g = groups) =>
  renderToStaticMarkup(
    <RescheduleClock groups={g} selection={selection} mode={mode} onModeChange={() => {}} onSelect={() => {}} />,
  );

/** Atributos del botón de la esfera con esa etiqueta accesible. */
const button = (html: string, label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

describe("RescheduleClock", () => {
  it("arriba muestra la hora y los minutos elegidos, con el segmento activo marcado", () => {
    const html = render("hour", { hour: 9, minute: 30 });
    expect(button(html, "Hora: 09")).toContain('aria-pressed="true"');
    expect(button(html, "Minutos: 30")).toContain('aria-pressed="false"');
  });

  it("en horas: solo las horas libres se pueden tocar; el resto queda deshabilitado (S3)", () => {
    const html = render("hour", { hour: 9, minute: 30 });
    expect(button(html, "9 horas")).not.toContain("disabled");
    expect(button(html, "9 horas")).toContain('aria-checked="true"');
    expect(button(html, "14 horas")).not.toContain("disabled");
    expect(button(html, "10 horas")).toContain("disabled");
    expect(button(html, "0 horas")).toContain("disabled");
    // Las 24 horas de la esfera, en dos anillos.
    expect(html.match(/role="radio"/g)).toHaveLength(24);
  });

  it("en minutos: solo los minutos libres de la hora elegida (S3)", () => {
    const html = render("minute", { hour: 9, minute: 0 });
    expect(button(html, "Minuto 00")).toContain('aria-checked="true"');
    expect(button(html, "Minuto 30")).not.toContain("disabled");
    expect(button(html, "Minuto 45")).toContain("disabled");
    expect(button(html, "Minuto 15")).toContain("disabled");
  });

  it("sin horarios libres todo queda deshabilitado y arriba se ve --", () => {
    const html = render("hour", null, []);
    expect(html.match(/role="radio"[^>]*disabled=""/g)).toHaveLength(24);
    expect(button(html, "Hora: --")).toContain("disabled");
  });
});
