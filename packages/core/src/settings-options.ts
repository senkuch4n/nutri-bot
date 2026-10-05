// HU-017b-4 (SDD 4.1 de 017b-4, D21 y D22). Listas de zona horaria y moneda con nombres comunes, y los
// textos de Ajustes sin jerga. Lo que se guarda en Professional es el mismo dato de siempre (la zona
// "America/Argentina/Buenos_Aires", la moneda "ARS"): solo cambia cómo se elige y cómo se lee.

export interface Option {
  value: string;
  label: string;
}

/** Zonas de Argentina primero, con nombres comunes; después Uruguay, Chile, Paraguay y España.
 *  "Otra…" la arma la UI con Intl.supportedValuesOf("timeZone"). */
export const TIMEZONE_OPTIONS: readonly Option[] = [
  { value: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires, Córdoba, Rosario…)" },
  { value: "America/Argentina/Cordoba", label: "Argentina (Córdoba, Santa Fe y el litoral)" },
  { value: "America/Argentina/Mendoza", label: "Argentina (Mendoza)" },
  { value: "America/Argentina/Tucuman", label: "Argentina (Tucumán)" },
  { value: "America/Argentina/Salta", label: "Argentina (Salta, Neuquén, Río Negro y La Pampa)" },
  { value: "America/Argentina/Jujuy", label: "Argentina (Jujuy)" },
  { value: "America/Argentina/Catamarca", label: "Argentina (Catamarca y Chubut)" },
  { value: "America/Argentina/La_Rioja", label: "Argentina (La Rioja)" },
  { value: "America/Argentina/San_Juan", label: "Argentina (San Juan)" },
  { value: "America/Argentina/San_Luis", label: "Argentina (San Luis)" },
  { value: "America/Argentina/Rio_Gallegos", label: "Argentina (Santa Cruz)" },
  { value: "America/Argentina/Ushuaia", label: "Argentina (Tierra del Fuego)" },
  { value: "America/Montevideo", label: "Uruguay" },
  { value: "America/Santiago", label: "Chile" },
  { value: "America/Asuncion", label: "Paraguay" },
  { value: "Europe/Madrid", label: "España" },
];

export const CURRENCY_OPTIONS: readonly Option[] = [
  { value: "ARS", label: "Pesos argentinos (ARS)" },
  { value: "USD", label: "Dólares (USD)" },
  { value: "EUR", label: "Euros (EUR)" },
  { value: "UYU", label: "Pesos uruguayos (UYU)" },
  { value: "CLP", label: "Pesos chilenos (CLP)" },
];

/** Etiqueta para un valor guardado: la de la lista o, si no está, el valor tal cual. */
export function timezoneLabel(tz: string): string {
  return TIMEZONE_OPTIONS.find((o) => o.value === tz)?.label ?? tz;
}

export function currencyLabel(code: string): string {
  return CURRENCY_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

/** Etiqueta legible de una zona que no está en la lista (para "Otra…"):
 *  "America/Bogota" → "Bogota (America)"; "America/Indiana/Knox" → "Knox (America, Indiana)";
 *  "UTC" → "UTC". Los "_" pasan a espacios. */
export function otherTimezoneLabel(tz: string): string {
  const parts = tz.split("/").map((p) => p.replace(/_/g, " "));
  const city = parts.pop() ?? tz;
  return parts.length ? `${city} (${parts.join(", ")})` : city;
}

/** ¿Es un código de moneda de 3 letras? (mayúsculas o minúsculas). */
export function isCurrencyCode(code: string): boolean {
  return /^[A-Za-z]{3}$/.test(code.trim());
}

/** Valor del `<select>` que significa "Otra…" (nunca es una zona ni una moneda real). */
export const OTHER_OPTION_VALUE = "__otra__";

/** Textos de Ajustes (HU §4.8). Sin nombres de variables, comandos ni formatos técnicos a la vista:
 *  lo técnico va detrás de "Ver detalle técnico" (D22). */
export const SETTINGS_TEXT = {
  sections: {
    general: "General",
    whatsapp: "Bot de WhatsApp",
    google: "Google Calendar",
    pdf: "Informes en PDF",
  },
  pageDescription: "Tus datos, el bot de WhatsApp, Google Calendar y tus informes en PDF.",
  back: "Ajustes",
  save: "Guardar",
  saving: "Guardando…",
  saved: "Guardado",
  unsaved: "Cambios sin guardar",
  technicalDetail: "Ver detalle técnico",
  askInstaller: "Avisale a quien te instaló el sistema.",
  saveError: "No se pudo guardar. Probá de nuevo.",

  // General
  yourData: "Tus datos",
  timezone: "Zona horaria",
  timezoneHelp: "Los horarios de los turnos y los avisos del bot usan esta zona.",
  currency: "Moneda",
  other: "Otra…",
  otherTimezone: "Elegí tu zona",
  otherCurrency: "Elegí la moneda",
  phone: "Tu WhatsApp (para avisarte)",
  phoneHelp: "Te avisamos cuando una paciente saca o cancela un turno.",
  phonePlaceholder: "351 555 2345",
  phonePreview: (formatted: string) => `Te avisamos al ${formatted}`,
  phoneEmpty: "Sin número: el bot no te avisa por WhatsApp.",
  insurances: "Obras sociales",
  insurancesHelp: "El bot las muestra cuando una paciente pregunta precios. Separalas con coma.",
  insurancesPlaceholder: "OSDE, Swiss Medical, Galeno, Particular…",
  remindersLink: "Los recordatorios se configuran en cada servicio",
  invalidTimezone: "Elegí una zona horaria de la lista.",
  invalidCurrency: "Elegí una moneda de la lista.",
  insurancesTooLong: "Las obras sociales no pueden pasar de 500 letras.",

  // Bot de WhatsApp
  botDisconnected: "WhatsApp desconectado: el bot no está respondiendo",
  botDisconnectedHelp: "Vinculá tu WhatsApp otra vez para que el bot vuelva a contestar.",
  connectWhatsapp: "Conectar WhatsApp",
  connection: "Conexión",
  connected: "Conectado",
  disconnected: "Desconectado",
  attendFrom: "Atendés consultas de",
  attendTo: "a",
  afterHoursTitle: "Horario de consultas",
  afterHoursToggle: "Tomar consultas fuera de horario",
  afterHoursOn: (time: string) =>
    `Fuera de ese horario, el bot toma la consulta y te manda un resumen a las ${time}.`,
  afterHoursOff: "Cuando una paciente pide hablar con vos, te avisamos en el momento, a cualquier hora.",
  aiTitle: "Preguntas con IA",
  aiUnavailable: "Esta opción todavía no está disponible. Avisale a quien te instaló el sistema.",
  aiKeyDetail: (envName: string) => `Falta cargar la variable ${envName} en el servidor.`,

  // Google Calendar
  googleConnected: "Conectado",
  googleNotConnected: "Sin conectar",
  googleConnect: "Conectar Google Calendar",
  googleReconnect: "Reconectar",
  googleDisconnect: "Desconectar",
  googleDisconnectTitle: "¿Desconectar Google Calendar?",
  googleDisconnectDescription: "Los turnos nuevos dejan de aparecer en tu calendario de Google.",
  googleSyncError: "Google dejó de aceptar la conexión. Reconectá para que los turnos sigan apareciendo.",
  googleCalendar: "Calendario",
  googleMainCalendar: "Tu calendario principal",
  googleOtherCalendar: "Otro calendario",
  googleAdvanced: "Opciones avanzadas",
  googleCalendarIdLabel: "Identificador del calendario",
  googleCalendarIdHelp: "Dejalo vacío para usar tu calendario principal.",
  googleHelp: "Los turnos confirmados aparecen solos en tu calendario de Google.",

  // Informes en PDF
  identityTitle: "Firma y matrícula",
  pdfStyleTitle: "Color y pie de página",
  pdfColor: "Color de los informes",
  pdfColorHelp: "Se usa en el PDF del plan y en el informe antropométrico.",
  pdfFooter: "Pie de página",
  pdfFooterHelp: "Reemplaza el texto que va al pie de cada hoja.",
  pdfFooterPlaceholder: "Lic. en Nutrición · M.P. 1234 · Turnos al +54 9 351 555-2345…",
  pdfColorInvalid: "Elegí un color de la paleta.",
  pdfFooterTooLong: "El pie de página no puede pasar de 300 letras.",
  titleLabel: "Título",
  titleHelp: "Va antes de tu nombre. Ej.: “Lic.”",
  licenseLabel: "Matrícula",
  titleTooLong: "El título no puede pasar de 20 letras.",
  licenseTooLong: "La matrícula no puede pasar de 40 letras.",
  chooseImage: "Elegir imagen",
  noFile: "Ningún archivo elegido",
  cancelFile: "Cancelar",
  logoTitle: "Logo",
  uploadLogo: "Subir logo",
  uploadingLogo: "Subiendo…",
  logoUploaded: "Logo actualizado",
  removeLogo: "Quitar",
  removeLogoTitle: "¿Quitar el logo?",
  removeLogoDescription: "Los próximos PDF salen sin logo.",
  logoRemoved: "Logo quitado",
  noLogo: "Sin logo",
  newPreview: "Vista previa",

  // Vinculación
  linkTitle: "Vincular WhatsApp",
  linkDescription: "Conectá el WhatsApp desde el que responde el bot.",
  linkSteps: [
    "Abrí WhatsApp en tu teléfono",
    "Tocá Dispositivos vinculados → Vincular un dispositivo",
    "Apuntá la cámara a este código",
  ],
  linkQrAlt: "Código para vincular WhatsApp",
  linkAutoRefresh: "Se actualiza sola.",
  linkDone: "Listo, tu WhatsApp está conectado.",
  backToSettings: "Volver a Ajustes",
  botNotRunning: "El bot no está funcionando. Avisale a quien te instaló el sistema.",
  botNotRunningDetail: "El proceso del bot no está corriendo. Se levanta con npm run dev:bot.",
  lastConnected: (when: string) => `Última conexión: ${when}`,
} as const;
