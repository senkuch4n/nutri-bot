import { describe, expect, it } from "vitest";
import {
  archiveBlockedText,
  formatArchivedDate,
  formatPendingAppointment,
  PATIENT_ARCHIVE_TEXT as T,
} from "./patient-archive";

const TZ = "America/Argentina/Buenos_Aires";
// Jueves 30/10/2025 10:00 en Buenos Aires (UTC-3).
const THU = new Date("2025-10-30T13:00:00Z");
const NOW = new Date("2025-10-24T15:00:00Z");

describe("formatArchivedDate", () => {
  it("dd/MM/yyyy en la zona", () => {
    expect(formatArchivedDate(new Date("2026-10-24T15:00:00Z"), TZ)).toBe("24/10/2026");
  });
  it("usa la zona, no UTC (01:30 UTC del 25/10 todavía es 24/10)", () => {
    expect(formatArchivedDate(new Date("2026-10-25T01:30:00Z"), TZ)).toBe("24/10/2026");
  });
});

describe("formatPendingAppointment", () => {
  it("mismo año: día de la semana, dd/MM y hora", () => {
    expect(formatPendingAppointment(THU, NOW, TZ)).toBe("jueves 30/10 a las 10:00");
  });
  it("otro año: con el año", () => {
    // Sábado 30/10/2027 10:00 en Buenos Aires.
    expect(formatPendingAppointment(new Date("2027-10-30T13:00:00Z"), NOW, TZ)).toBe(
      "sábado 30/10/2027 a las 10:00",
    );
  });
});

describe("archiveBlockedText", () => {
  it("con nombre y un solo turno: el texto de la HU", () => {
    expect(archiveBlockedText({ name: "Ana", startsAt: THU, moreCount: 0, now: NOW, tz: TZ })).toBe(
      "Ana tiene un turno el jueves 30/10 a las 10:00. Cancelalo antes de archivarla.",
    );
  });
  it("con varios: «y N más» y plural", () => {
    expect(archiveBlockedText({ name: "Ana", startsAt: THU, moreCount: 2, now: NOW, tz: TZ })).toBe(
      "Ana tiene un turno el jueves 30/10 a las 10:00 y 2 más. Cancelalos antes de archivarla.",
    );
  });
  it("sin nombre: «Este contacto … archivarlo»", () => {
    expect(archiveBlockedText({ name: null, startsAt: THU, moreCount: 0, now: NOW, tz: TZ })).toBe(
      "Este contacto tiene un turno el jueves 30/10 a las 10:00. Cancelalo antes de archivarlo.",
    );
    expect(archiveBlockedText({ name: "   ", startsAt: THU, moreCount: 1, now: NOW, tz: TZ })).toBe(
      "Este contacto tiene un turno el jueves 30/10 a las 10:00 y 1 más. Cancelalos antes de archivarlo.",
    );
  });
  it("nombre compuesto: usa el primer nombre", () => {
    expect(
      archiveBlockedText({ name: "  Ana María López ", startsAt: THU, moreCount: 0, now: NOW, tz: TZ }),
    ).toMatch(/^Ana tiene un turno/);
  });
});

describe("PATIENT_ARCHIVE_TEXT", () => {
  it("textos exactos de la HU", () => {
    expect(T.confirmTitle("Ana López")).toBe("¿Archivar a Ana López?");
    expect(T.confirmTitle(null)).toBe("¿Archivar este contacto?");
    expect(T.confirmDescription).toBe(
      "Deja de aparecer en tu lista, en \"Nuevo turno\" y en los comunicados. No se borra nada: la encontrás en \"Archivadas\" y la podés desarchivar cuando quieras.",
    );
    expect(T.confirmDescriptionUnnamed("11 5555-1234")).toBe(`11 5555-1234. ${T.confirmDescription}`);
    expect(T.archived("Ana López")).toBe("Ana López quedó archivada");
    expect(T.archived(null)).toBe("El contacto quedó archivado");
    expect(T.unarchived("Ana López")).toBe("Ana López volvió a tu lista de pacientes");
    expect(T.banner("24/10/2026")).toBe(
      "Paciente archivada el 24/10/2026. No aparece en tu lista ni recibe comunicados.",
    );
    expect(T.archivedSection(3)).toBe("Archivadas (3)");
    expect(T.archivedOn("24/10/2026")).toBe("Archivada el 24/10/2026");
    expect(T.phoneTakenArchived("Ana López")).toBe("Ese número es de Ana López, que está archivada.");
    expect(T.unarchiveAndOpen).toBe("Desarchivar y abrir su ficha");
  });
});
