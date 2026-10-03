import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVICE_REMINDERS,
  SERVICE_REMINDERS_TEXT,
  formatReminderLead,
  parseServiceReminders,
  pickDueReminder,
  relativeDayPhrase,
  reminderDedupeKey,
  reminderLeadInHours,
  reminderMoment,
  reminderStatusItems,
  reminderStatusText,
  serviceRemindersSummary,
  sortServiceReminders,
  validateServiceReminders,
  type ServiceReminder,
} from "./service-reminders";

const TZ = "America/Argentina/Buenos_Aires"; // UTC−3, sin horario de verano
const H = 3_600_000;
const MIN = 60_000;
const DAY_MS = 24 * H;

const days = (amount: number, asksConfirmation = false): ServiceReminder => ({ amount, unit: "DAYS", asksConfirmation });
const hours = (amount: number, asksConfirmation = false): ServiceReminder => ({ amount, unit: "HOURS", asksConfirmation });
const d = (iso: string) => new Date(iso);
const at = (base: Date, deltaMs: number) => new Date(base.getTime() + deltaMs);
const NONE = { autoKeys: new Set<string>(), confirmationSent: false, autoSentAt: [] };
const EARLY = d("2026-09-01T12:00:00Z");

describe("reminderLeadInHours / reminderDedupeKey", () => {
  it("convierte días a horas y arma la clave", () => {
    expect(reminderLeadInHours(days(2))).toBe(48);
    expect(reminderDedupeKey(days(2))).toBe("auto:48h");
    expect(reminderLeadInHours(hours(24))).toBe(24);
    expect(reminderDedupeKey(hours(24))).toBe("auto:24h");
  });
});

describe("DEFAULT_SERVICE_REMINDERS", () => {
  it("es 3 días pide confirmar + 24 h (igual al @default de Service.reminders)", () => {
    expect(DEFAULT_SERVICE_REMINDERS).toEqual([days(3, true), hours(24)]);
  });
});

describe("validateServiceReminders", () => {
  it("lista vacía es válida", () => {
    expect(validateServiceReminders([])).toEqual({ ok: true, reminders: [] });
  });

  it("ordena de mayor a menor y descarta claves extra", () => {
    const r = validateServiceReminders([
      { amount: 24, unit: "HOURS", asksConfirmation: false, extra: 1 },
      { amount: 3, unit: "DAYS", asksConfirmation: true },
    ]);
    expect(r).toEqual({ ok: true, reminders: [days(3, true), hours(24)] });
  });

  it("más de 3 → tooMany de la lista", () => {
    expect(validateServiceReminders([hours(1), hours(2), hours(3), hours(4)])).toEqual({
      ok: false,
      errors: [{ index: null, message: SERVICE_REMINDERS_TEXT.tooMany }],
    });
  });

  it.each([
    [hours(0)],
    [hours(337)],
    [days(15)],
    [days(0)],
  ])("fuera de rango %j", (row) => {
    expect(validateServiceReminders([hours(5), row])).toEqual({
      ok: false,
      errors: [{ index: 1, message: SERVICE_REMINDERS_TEXT.outOfRange }],
    });
  });

  it("los bordes 1 h y 14 días son válidos", () => {
    expect(validateServiceReminders([hours(1), days(14)])).toEqual({ ok: true, reminders: [days(14), hours(1)] });
    expect(validateServiceReminders([hours(336)]).ok).toBe(true);
  });

  it.each([null, "", 1.5, "3", Number.NaN])("amount %j → notInteger", (amount) => {
    expect(validateServiceReminders([{ amount, unit: "HOURS", asksConfirmation: false }])).toEqual({
      ok: false,
      errors: [{ index: 0, message: SERVICE_REMINDERS_TEXT.notInteger }],
    });
  });

  it.each([
    [{ amount: 1, unit: "WEEKS", asksConfirmation: false }],
    [null],
    [{ amount: 1, unit: "DAYS", asksConfirmation: "si" }],
  ])("fila con forma inválida %j → invalid", (row) => {
    expect(validateServiceReminders([row])).toEqual({
      ok: false,
      errors: [{ index: 0, message: SERVICE_REMINDERS_TEXT.invalid }],
    });
  });

  it("2 días y 48 h son la misma anticipación → duplicate en la posterior", () => {
    expect(validateServiceReminders([days(2), hours(48)])).toEqual({
      ok: false,
      errors: [{ index: 1, message: SERVICE_REMINDERS_TEXT.duplicate }],
    });
  });

  it("dos que piden confirmar → oneConfirmation en la posterior", () => {
    expect(validateServiceReminders([days(3, true), hours(24, true)])).toEqual({
      ok: false,
      errors: [{ index: 1, message: SERVICE_REMINDERS_TEXT.oneConfirmation }],
    });
  });

  it("junta errores de varias filas", () => {
    const r = validateServiceReminders([hours(0), { amount: "x", unit: "HOURS", asksConfirmation: false }]);
    expect(r).toEqual({
      ok: false,
      errors: [
        { index: 0, message: SERVICE_REMINDERS_TEXT.outOfRange },
        { index: 1, message: SERVICE_REMINDERS_TEXT.notInteger },
      ],
    });
  });

  it.each([{}, "x", null, undefined])("no array %j → invalid de la lista", (input) => {
    expect(validateServiceReminders(input)).toEqual({
      ok: false,
      errors: [{ index: null, message: SERVICE_REMINDERS_TEXT.invalid }],
    });
  });
});

describe("parseServiceReminders", () => {
  it("JSON válido → igual que validate", () => {
    expect(parseServiceReminders([hours(24), days(3, true)])).toEqual([days(3, true), hours(24)]);
  });

  it.each([null, {}, "x", 3])("basura %j → []", (json) => {
    expect(parseServiceReminders(json)).toEqual([]);
  });

  it("se queda con las filas válidas", () => {
    expect(parseServiceReminders([hours(24), { amount: "x" }, days(7)])).toEqual([days(7), hours(24)]);
  });

  it("duplicados: gana el primero", () => {
    expect(parseServiceReminders([days(2, true), hours(48)])).toEqual([days(2, true)]);
  });

  it("dos que piden confirmar: solo el primero lo conserva", () => {
    expect(parseServiceReminders([hours(24, true), days(3, true)])).toEqual([days(3), hours(24, true)]);
  });

  it("5 válidas → 3", () => {
    const out = parseServiceReminders([hours(1), hours(2), hours(3), hours(4), hours(5)]);
    expect(out).toEqual([hours(3), hours(2), hours(1)]);
  });
});

describe("sortServiceReminders", () => {
  it("no muta la lista original", () => {
    const list = [hours(24), days(3)];
    expect(sortServiceReminders(list)).toEqual([days(3), hours(24)]);
    expect(list).toEqual([hours(24), days(3)]);
  });
});

describe("reminderMoment", () => {
  it("24 HOURS: horas exactas", () => {
    expect(reminderMoment(d("2026-10-15T13:00:00Z"), hours(24), TZ)).toEqual(d("2026-10-14T13:00:00Z"));
  });

  it("7 DAYS: misma hora de pared una semana antes", () => {
    expect(reminderMoment(d("2026-10-13T20:00:00Z"), days(7), TZ)).toEqual(d("2026-10-06T20:00:00Z"));
  });

  it("2 DAYS con turno 08:00 → 09:00 del martes (corrido)", () => {
    expect(reminderMoment(d("2026-10-15T11:00:00Z"), days(2), TZ)).toEqual(d("2026-10-13T12:00:00Z"));
  });

  it("1 DAYS con turno sábado 23:00 → viernes 09:00 (mismo día calendario)", () => {
    expect(reminderMoment(d("2026-10-18T02:00:00Z"), days(1), TZ)).toEqual(d("2026-10-16T12:00:00Z"));
  });

  it("bordes de la franja 22:00–09:00", () => {
    // 21:59 ART → no se corre
    expect(reminderMoment(d("2026-10-16T00:59:00Z"), days(1), TZ)).toEqual(d("2026-10-15T00:59:00Z"));
    // 22:00 ART → se corre a 09:00 del mismo día
    expect(reminderMoment(d("2026-10-16T01:00:00Z"), days(1), TZ)).toEqual(d("2026-10-14T12:00:00Z"));
    // 08:59 ART → se corre a 09:00
    expect(reminderMoment(d("2026-10-15T11:59:00Z"), days(1), TZ)).toEqual(d("2026-10-14T12:00:00Z"));
    // 09:00 ART → queda a las 09:00
    expect(reminderMoment(d("2026-10-15T12:00:00Z"), days(1), TZ)).toEqual(d("2026-10-14T12:00:00Z"));
    // 09:30 ART → no se corre
    expect(reminderMoment(d("2026-10-15T12:30:00Z"), days(1), TZ)).toEqual(d("2026-10-14T12:30:00Z"));
  });

  it("las horas no se corren (2 h antes de un turno a las 08:00 → 06:00)", () => {
    expect(reminderMoment(d("2026-10-15T11:00:00Z"), hours(2), TZ)).toEqual(d("2026-10-15T09:00:00Z"));
  });

  it("respeta el cambio de horario (Europe/Madrid)", () => {
    expect(reminderMoment(d("2026-10-27T09:00:00Z"), days(3), "Europe/Madrid")).toEqual(d("2026-10-24T08:00:00Z"));
  });
});

describe("pickDueReminder", () => {
  const pick = (over: Partial<Parameters<typeof pickDueReminder>[0]> & { startsAt: Date; now: Date }) =>
    pickDueReminder({ bookedAt: EARLY, reminders: [], tz: TZ, sent: NONE, ...over });

  it("control 7 días: sale apenas pasa su momento", () => {
    const startsAt = d("2026-10-13T20:00:00Z");
    const moment = d("2026-10-06T20:00:00Z");
    const r = pick({ startsAt, reminders: [days(7)], now: at(moment, MIN) });
    expect(r).toEqual({ reminder: days(7), moment, key: "auto:168h" });
    expect(pick({ startsAt, reminders: [days(7)], now: at(moment, -MIN) })).toBeNull();
  });

  it("primera consulta (2 días + 24 h): uno por vez, sin repetir", () => {
    const startsAt = d("2026-10-15T13:00:00Z"); // jueves 10:00
    const reminders = [days(2), hours(24)];
    expect(pick({ startsAt, reminders, now: d("2026-10-13T13:01:00Z") })?.key).toBe("auto:48h");
    expect(
      pick({ startsAt, reminders, now: d("2026-10-14T13:01:00Z"), sent: { autoKeys: new Set(["auto:48h"]), confirmationSent: false, autoSentAt: [] } })
        ?.key,
    ).toBe("auto:24h");
    expect(
      pick({
        startsAt,
        reminders,
        now: d("2026-10-14T13:01:00Z"),
        sent: { autoKeys: new Set(["auto:48h", "auto:24h"]), confirmationSent: false, autoSentAt: [] },
      }),
    ).toBeNull();
  });

  it("idempotencia: el elegido ya enviado → null", () => {
    const startsAt = d("2026-10-15T13:00:00Z");
    expect(
      pick({ startsAt, reminders: [hours(24)], now: d("2026-10-14T13:01:00Z"), sent: { autoKeys: new Set(["auto:24h"]), confirmationSent: false, autoSentAt: [] } }),
    ).toBeNull();
  });

  it("reserva tardía: el de 2 días no existe, el de 24 h sí", () => {
    const startsAt = d("2026-10-15T13:00:00Z");
    const bookedAt = at(startsAt, -46 * H);
    const reminders = [days(2), hours(24)];
    expect(pick({ startsAt, bookedAt, reminders, now: at(bookedAt, MIN) })).toBeNull();
    expect(pick({ startsAt, bookedAt, reminders, now: at(startsAt, -24 * H + MIN) })?.key).toBe("auto:24h");
  });

  it("reserva con menos anticipación que todos → nunca", () => {
    const startsAt = d("2026-10-15T13:00:00Z");
    const bookedAt = at(startsAt, -20 * H);
    const reminders = [days(2), hours(24)];
    expect(pick({ startsAt, bookedAt, reminders, now: at(startsAt, -19 * H) })).toBeNull();
    expect(pick({ startsAt, bookedAt, reminders, now: at(startsAt, -1 * H) })).toBeNull();
  });

  it("bot caído: solo el más cercano al turno y si faltan más de 2 h", () => {
    const startsAt = d("2026-10-15T13:00:00Z");
    const bookedAt = at(startsAt, -5 * 24 * H);
    const reminders = [days(2), hours(24)];
    expect(pick({ startsAt, bookedAt, reminders, now: at(startsAt, -20 * H) })?.key).toBe("auto:24h");
    expect(pick({ startsAt, bookedAt, reminders, now: at(startsAt, -90 * MIN) })).toBeNull();
    expect(pick({ startsAt, bookedAt, reminders, now: at(startsAt, -2 * H - MIN) })?.key).toBe("auto:24h");
    expect(pick({ startsAt, bookedAt, reminders, now: at(startsAt, -2 * H) })).toBeNull();
  });

  it("dentro de la tolerancia sale aunque falten menos de 2 h", () => {
    const startsAt = d("2026-10-15T13:00:00Z");
    const moment = at(startsAt, -H);
    expect(pick({ startsAt, reminders: [hours(1)], now: at(moment, 10 * MIN) })?.key).toBe("auto:1h");
    expect(pick({ startsAt, reminders: [hours(1)], now: at(moment, 16 * MIN) })).toBeNull();
  });

  it("seña: la aprobación posterior al momento de 2 días lo saltea; el de 24 h sale", () => {
    const startsAt = d("2026-10-15T13:00:00Z");
    const moment48 = at(startsAt, -48 * H);
    const bookedAt = at(moment48, 30 * MIN);
    const reminders = [days(2), hours(24)];
    expect(pick({ startsAt, bookedAt, reminders, now: at(moment48, H) })).toBeNull();
    expect(pick({ startsAt, bookedAt, reminders, now: at(startsAt, -24 * H + MIN) })?.key).toBe("auto:24h");
  });

  it("turno ya empezado o lista vacía → null", () => {
    const startsAt = d("2026-10-15T13:00:00Z");
    expect(pick({ startsAt, reminders: [hours(24)], now: startsAt })).toBeNull();
    expect(pick({ startsAt, reminders: [hours(24)], now: at(startsAt, H) })).toBeNull();
    expect(pick({ startsAt, reminders: [], now: at(startsAt, -24 * H + MIN) })).toBeNull();
  });

  it("pide confirmar: se elige con asksConfirmation y no se repite", () => {
    const startsAt = d("2026-10-15T13:00:00Z");
    const now = at(startsAt, -72 * H + MIN);
    const r = pick({ startsAt, reminders: [days(3, true), hours(24)], now });
    expect(r?.reminder).toEqual(days(3, true));
    expect(
      pick({ startsAt, reminders: [days(3, true), hours(24)], now, sent: { autoKeys: new Set(), confirmationSent: true, autoSentAt: [] } }),
    ).toBeNull();
    // una clave "auto:72h" no cuenta como confirmación enviada
    expect(
      pick({ startsAt, reminders: [days(3, true)], now, sent: { autoKeys: new Set(["auto:72h"]), confirmationSent: false, autoSentAt: [] } })
        ?.reminder.asksConfirmation,
    ).toBe(true);
  });

  it("corrimiento D6: 2 días con turno jueves 08:00 sale el martes 09:00", () => {
    const startsAt = d("2026-10-15T11:00:00Z");
    expect(pick({ startsAt, reminders: [days(2)], now: d("2026-10-13T11:30:00Z") })).toBeNull();
    expect(pick({ startsAt, reminders: [days(2)], now: d("2026-10-13T12:01:00Z") })?.key).toBe("auto:48h");
  });

  it("empate de momentos: gana el de menor anticipación", () => {
    const startsAt = d("2026-10-15T11:00:00Z"); // 08:00
    const r = pick({ startsAt, reminders: [days(1), hours(23)], now: d("2026-10-14T12:01:00Z") });
    expect(r?.key).toBe("auto:23h");
  });
});

describe("pickDueReminder: cambio de config con avisos ya enviados (SDD §15)", () => {
  const startsAt = d("2026-10-15T13:00:00Z"); // jueves 10:00
  const pick = (reminders: ServiceReminder[], now: Date, sent: { autoKeys: string[]; confirmationSent?: boolean; autoSentAt: Date[] }) =>
    pickDueReminder({
      startsAt,
      bookedAt: EARLY,
      reminders,
      tz: TZ,
      now,
      sent: { autoKeys: new Set(sent.autoKeys), confirmationSent: sent.confirmationSent ?? false, autoSentAt: sent.autoSentAt },
    });

  it("24 h enviado y la config pasa a 48 h → no repite", () => {
    const sent24 = d("2026-10-14T13:00:00Z"); // miércoles 10:00
    const sentConf = d("2026-10-12T13:00:00Z");
    const now = d("2026-10-14T17:00:00Z"); // miércoles 14:00, faltan 20 h
    expect(
      pick([days(3, true), hours(48)], now, { autoKeys: ["auto:24h"], confirmationSent: true, autoSentAt: [sentConf, sent24] }),
    ).toBeNull();
    // Sin el dato de envíos automáticos, el algoritmo viejo lo habría repetido.
    expect(pick([days(3, true), hours(48)], now, { autoKeys: ["auto:24h"], confirmationSent: true, autoSentAt: [] })?.key).toBe(
      "auto:48h",
    );
  });

  it("mover 'pide confirmar' de 3 días a 24 h con el pedido ya enviado → nada a las −60 h", () => {
    const sentConf = at(startsAt, -72 * H + MIN);
    const now = at(startsAt, -60 * H);
    expect(pick([days(3), hours(24, true)], now, { autoKeys: [], confirmationSent: true, autoSentAt: [sentConf] })).toBeNull();
    // Y a las −24 h tampoco: la confirmación ya fue (P9).
    expect(
      pick([days(3), hours(24, true)], at(startsAt, -24 * H + MIN), { autoKeys: [], confirmationSent: true, autoSentAt: [sentConf] }),
    ).toBeNull();
  });

  it("P6: '23 h' (08:00) y '1 día' (09:00) con turno a las 07:00 salen los dos", () => {
    const turno = d("2026-10-15T10:00:00Z"); // jueves 07:00
    const reminders = [days(1), hours(23)];
    const first = pickDueReminder({ startsAt: turno, bookedAt: EARLY, reminders, tz: TZ, now: d("2026-10-14T11:01:00Z"), sent: NONE });
    expect(first?.key).toBe("auto:23h");
    const second = pickDueReminder({
      startsAt: turno,
      bookedAt: EARLY,
      reminders,
      tz: TZ,
      now: d("2026-10-14T12:01:00Z"),
      sent: { autoKeys: new Set(["auto:23h"]), confirmationSent: false, autoSentAt: [d("2026-10-14T11:01:00Z")] },
    });
    expect(second?.key).toBe("auto:24h");
  });

  it("agregar uno: [7 días] enviado + '2 días' nuevo → sale el de 2 días", () => {
    const sent7 = at(startsAt, -7 * DAY_MS + MIN);
    expect(pick([days(7), days(2)], at(startsAt, -2 * DAY_MS + MIN), { autoKeys: ["auto:168h"], autoSentAt: [sent7] })?.key).toBe(
      "auto:48h",
    );
  });

  it("los manuales no cuentan como cubiertos (no se pasan en autoSentAt)", () => {
    expect(pick([hours(24)], at(startsAt, -24 * H + MIN), { autoKeys: [], autoSentAt: [] })?.key).toBe("auto:24h");
  });

  it("bot caído sin envíos previos: sigue saliendo el más cercano", () => {
    expect(pick([days(2), hours(24)], at(startsAt, -20 * H), { autoKeys: [], autoSentAt: [] })?.key).toBe("auto:24h");
  });
});

describe("relativeDayPhrase", () => {
  const now = d("2026-10-13T15:00:00Z"); // martes 12:00 ART
  it.each([
    ["2026-10-13T20:00:00Z", "hoy"],
    ["2026-10-14T13:00:00Z", "mañana"],
    ["2026-10-15T13:00:00Z", "pasado mañana"],
    ["2026-10-16T13:00:00Z", "en 3 días"],
    ["2026-10-20T13:00:00Z", "en una semana"],
    ["2026-10-27T13:00:00Z", "en 14 días"],
    ["2026-10-12T13:00:00Z", "hoy"],
  ])("%s → %s", (startsAt, phrase) => {
    expect(relativeDayPhrase(now, d(startsAt), TZ)).toBe(phrase);
  });

  it("usa los días de la zona, no los de UTC", () => {
    expect(relativeDayPhrase(d("2026-10-14T02:30:00Z"), d("2026-10-14T13:00:00Z"), TZ)).toBe("mañana");
  });
});

describe("formatReminderLead / serviceRemindersSummary", () => {
  it("formatea la anticipación", () => {
    expect(formatReminderLead(days(1))).toBe("1 día");
    expect(formatReminderLead(days(3))).toBe("3 días");
    expect(formatReminderLead(hours(1))).toBe("1 h");
    expect(formatReminderLead(hours(24))).toBe("24 h");
  });

  it("resume la lista", () => {
    expect(serviceRemindersSummary([])).toBe("Sin recordatorios");
    expect(serviceRemindersSummary([days(7)])).toBe("Recordatorio: 7 días antes");
    expect(serviceRemindersSummary([days(3, true), hours(24)])).toBe("Recordatorios: 3 días (pide confirmar) y 24 h antes");
    expect(serviceRemindersSummary([hours(24), days(7), days(2)])).toBe("Recordatorios: 7 días, 2 días y 24 h antes");
  });
});

describe("reminderStatusItems / reminderStatusText", () => {
  const startsAt = d("2026-10-15T13:00:00Z");
  const reminders = [days(3, true), hours(24)];
  const base = { startsAt, bookedAt: EARLY, reminders, tz: TZ, confirmationRequestedAt: null };
  const msg = (kind: "REMINDER" | "CONFIRMATION_REQUEST", dedupeKey: string, status: "PENDING" | "SENT" | "FAILED", iso = "2026-10-12T13:00:00Z") => ({
    kind,
    dedupeKey,
    status,
    createdAt: d(iso),
  });

  it("confirmación enviada y 24 h pendiente", () => {
    const items = reminderStatusItems({
      ...base,
      now: d("2026-10-13T13:00:00Z"),
      messages: [msg("CONFIRMATION_REQUEST", "", "SENT")],
    });
    expect(reminderStatusText(items)).toBe("3 días antes, pide confirmar (enviado) · 24 h antes (pendiente)");
  });

  it("REMINDER en cola y fallido", () => {
    const now = d("2026-10-14T13:05:00Z");
    const conf = msg("CONFIRMATION_REQUEST", "", "SENT");
    expect(reminderStatusItems({ ...base, now, messages: [conf, msg("REMINDER", "auto:24h", "PENDING")] })[1]).toEqual({
      label: "24 h antes",
      state: "queued",
    });
    expect(reminderStatusItems({ ...base, now, messages: [conf, msg("REMINDER", "auto:24h", "FAILED")] })[1]?.state).toBe(
      "failed",
    );
  });

  it("confirmationRequestedAt sin fila cuenta como enviado", () => {
    const items = reminderStatusItems({ ...base, confirmationRequestedAt: d("2026-10-12T13:00:00Z"), now: d("2026-10-13T13:00:00Z"), messages: [] });
    expect(items[0]).toEqual({ label: "3 días antes, pide confirmar", state: "sent" });
  });

  it("momento anterior a la reserva → no aplica", () => {
    const items = reminderStatusItems({ ...base, bookedAt: d("2026-10-13T13:00:00Z"), now: d("2026-10-13T14:00:00Z"), messages: [] });
    expect(reminderStatusText(items)).toBe("3 días antes, pide confirmar (no aplica, se reservó después) · 24 h antes (pendiente)");
  });

  it("momento pasado, sin enviar y superado → no se envió (el elegible queda pendiente)", () => {
    const items = reminderStatusItems({ ...base, now: d("2026-10-14T13:05:00Z"), messages: [] });
    expect(items.map((i) => i.state)).toEqual(["skipped", "pending"]);
  });

  it("REMINDER automático que ya no está en la config y manuales", () => {
    const items = reminderStatusItems({
      ...base,
      now: d("2026-10-13T13:00:00Z"),
      messages: [
        msg("CONFIRMATION_REQUEST", "", "SENT"),
        msg("REMINDER", "manual:2026-10-12T15:00:00.000Z", "PENDING", "2026-10-12T15:00:00Z"),
        msg("REMINDER", "auto:168h", "SENT", "2026-10-08T13:00:00Z"),
      ],
    });
    expect(items.slice(2)).toEqual([
      { label: "7 días antes", state: "sent" },
      { label: "Manual", state: "queued" },
    ]);
  });

  it("clave huérfana que no es múltiplo de días → en horas", () => {
    const items = reminderStatusItems({ ...base, reminders: [], now: d("2026-10-13T13:00:00Z"), messages: [msg("REMINDER", "auto:24h", "SENT")] });
    expect(reminderStatusText(items)).toBe("24 h antes (enviado)");
  });

  it("cambio de config: el nuevo recordatorio cubierto no figura como pendiente (SDD §15)", () => {
    const items = reminderStatusItems({
      ...base,
      reminders: [days(3, true), hours(48)],
      now: d("2026-10-14T17:00:00Z"),
      messages: [msg("CONFIRMATION_REQUEST", "", "SENT"), msg("REMINDER", "auto:24h", "SENT", "2026-10-14T13:00:00Z")],
    });
    expect(reminderStatusText(items)).toBe("3 días antes, pide confirmar (enviado) · 48 h antes (no se envió) · 24 h antes (enviado)");
  });

  it("config vacía y sin mensajes → Sin recordatorios", () => {
    const items = reminderStatusItems({ ...base, reminders: [], now: d("2026-10-13T13:00:00Z"), messages: [] });
    expect(reminderStatusText(items)).toBe("Sin recordatorios");
  });
});
