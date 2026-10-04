# SDD: HU-017c `017c-pacientes-consultas` (Rediseño Apple 2/5: pacientes y consultas, simple de usar)

- **HU validada:** `docs/hu-017c-pacientes-consultas.md`. Manda su sección **"Resoluciones"
  (2026-10-04)**: D1–D18 aceptadas con su recomendación; D2/D3 confirmados con datos reales; corte en
  cuatro entregas **017c-1 → 017c-2 → 017c-3 → 017c-4**.
- **Depende de:** HU-017a (fundaciones, aprobada y en `develop`). Contrato de UI de 017a:
  `Refactorizaciones/rediseno-apple-fundaciones.md` §6.2–§6.3 y §9.
- **Rama de 017c-1:** `feat/hu-017c-pacientes` (sale de `develop`, `524c94a` + el commit de la HU).
  Ramas de las demás entregas: ver Q6.
- **Skill aplicado:** `skills/ui.txt` (traducir objetivos UX a pantallas: vista, estructura base,
  componentes clave). Está en la sección 6 de cada entrega ("Pantallas").
- **Nivel de detalle:** 017c-1 está detallada para implementarse ya. 017c-2, 017c-3 y 017c-4 traen
  contrato, archivos y checklist. Antes de arrancar cada una, el orquestador relee su sección y las Q
  que le tocan; si el recorrido de D1 cambia algo, se ajusta acá antes de lanzar el implementer.

> **Verificación del architect (2026-10-04, solo lectura).**
> - **Base de desarrollo** (Postgres en Docker, `nutri`/`nutribot`): `Patient.whatsappJid` tiene
>   7 `@s.whatsapp.net` (todos con nombre, `phone` de 13 dígitos `549…`), **5 `@newsletter`** (todos
>   sin nombre) y **9 `@lid`** (5 sin nombre). No hay nombres de solo espacios. `ConversationState`
>   tiene 14 filas (9 de `@lid`). Coincide con la Resolución D2/D3.
> - **Migraciones:** la base tiene aplicada `20261004174348_food_measures`, que **no** está en esta
>   rama (viene de la rama de 018d). `prisma migrate status` en esta rama va a decir que hay una
>   migración aplicada que no existe localmente. **No es de esta HU y no se toca** (nada de
>   `migrate dev`, `reset` ni `resolve`). Esta HU no necesita migración (sección 3 de cada entrega).
> - `apps/bot/src/whatsapp.ts:120` descarta `@g.us` y `status@broadcast`, pero no `@newsletter`. El
>   bot crea `Patient` con `findOrCreatePatientByJid` (`phone` = lo que va antes de la `@`). La
>   tarea directa del bot queda fuera (HU §5).
> - `pacientes/actions.ts#updatePatientAction` pisa `notes` y `birthDate` con `null` si no vienen en
>   el form. "Poner nombre" **no** puede usarla (sección 4.3 de 017c-1).
> - `deleteConsultationAction` hace `redirect()` en el servidor. Con el borrado diferido (D12a) ese
>   redirect llegaría 8 s después, desde otra pantalla: hay que sacarlo (017c-3).
> - `sonner@2.0.8`: `onAutoClose` se dispara al vencer el tiempo; `onDismiss`, al cerrar el toast
>   (botón, swipe, `toast.dismiss`). El clic en la acción ("Deshacer") **no** dispara ninguno de los
>   dos. El tiempo se pausa con el mouse encima. Es la base del mecanismo de 017c-3.
> - `lib/pdf-theme.ts` lo importan `plan-pdf.tsx` (imleticio), `pdf-common.tsx` (compartido entre el
>   PDF del plan y el del informe), `report-pdf-charts.tsx` (solo informe),
>   `anthropometric-report-pdf.tsx` (solo informe) y `ajustes/settings-form.tsx`
>   (`DEFAULT_PDF_ACCENT`).
> - `?tab=` dentro del repo: `?tab=consultas` (consulta, `requirement-summary-card.tsx`,
>   `consultation-actions.ts`, `planes/[planId]/page.tsx`), `?tab=datos` (`requirement-section.tsx`,
>   `antropometria/page.tsx`, `clinical-alert.tsx` vía `PatientTabLink`), `?tab=planes`
>   (`planes/[planId]/page.tsx`, **imleticio, no se edita**), `PatientTabLink tab="evolucion"`
>   (`evolution-summary.tsx`).
> - El calendario (`(calendario)/page.tsx` + `calendar-client.tsx`) no acepta una fecha por URL (Q7).
> - `Refactorizaciones/buscador-recetas.md` no está en esta rama; se leyó desde
>   `feat/hu-018c-buscador-recetas` (`git show 7607e9e:…`) como referencia de formato.

---

## 0. Decisiones que valen para las cuatro entregas

| ID | Decisión | Por qué |
|---|---|---|
| T1 | **Sin migración ni cambios en `schema.prisma`** en ninguna entrega. Todo lo nuevo es lectura o escribe campos que ya existen (`Patient.name`, los de "Editar datos"). | HU §3 y §5. "Ocultar contacto" o "archivar" quedan fuera. |
| T2 | **Lógica pura en `packages/core`**, en módulos nuevos con su `*.test.ts`: contacto de WhatsApp, formato de teléfono, fechas en lenguaje común, directorio de pacientes (017c-1); resumen del paciente (017c-2). Lo que es solo de presentación o ruteo de la UI (alias de pestañas, cola de borrados diferidos) va a `apps/web/src/lib/` con test, como en 017a (D-T9). | AGENTS.md "Dónde va la lógica"; el pedido explícito del orquestador. |
| T3 | **`packages/db/domain` no cambia.** Las consultas nuevas las usa solo la web (lista y ficha) y van en la página o en la action. Ninguna firma de `domain` se toca, así que el bot no se entera. Igual se corre `typecheck` en los 4 workspaces. | AGENTS.md: `domain` es para lo que comparten web y bot. |
| T4 | **Textos compartidos (D11b):** no se cambia ningún texto que vea el paciente (portal, WhatsApp) ni que salga en el PDF. Los textos nuevos de estas pantallas van en constantes nuevas de core (`PATIENT_DIRECTORY_TEXT`, `PATIENT_SUMMARY_TEXT`) o en la UI. Solo se cambian en core textos que se muestran **únicamente** en el panel y que esta HU deja falsos o viejos (lista cerrada en la sección 0.1), con sus tests. | D11 (b). |
| T5 | **Componentes de 017a:** `GroupedList`/`GroupedListRow`, `SegmentedControl`, `Metric`, `DropdownMenuItem variant="destructive"`, `Sheet`, `useConfirm`, `notify.undo`. Las props nuevas son **opcionales** y con default igual a lo de hoy (R1 de la madre). | HU §6. |
| T6 | **Zona de imleticio sin cambios de archivo:** `alimentos/**`, `pacientes/[id]/planes/**`, `plantillas/**`, `components/food-picker.tsx`, `components/meals-editor.tsx`, `lib/plan-pdf.tsx`. `plans-section.tsx`, **solo en lo visual** (017c-2). `pdf-theme.ts` no cambia sus exports (017c-4). | HU §2.5 y §5. |
| T7 | **Movimiento:** solo `m.*` de `motion/react` (LazyMotion `strict`), presets de `lib/motion.ts`, animar solo `opacity`/`transform`. Con movimiento reducido, fundido corto (`fades.fast`). | 017a §18. |
| T8 | **Datos y WhatsApp:** el recorrido es de solo lectura sobre los datos de la usuaria. Las pruebas que escriben crean sus filas y las borran **por id**. Nada de esta HU encola en `OutboundMessage`, salvo "Enviar por WhatsApp" del informe (017c-4), que **no se aprieta** en ninguna verificación. | AGENTS.md, reglas duras. |

### 0.1 Textos de core que esta HU cambia (solo panel; D11b)

| Texto | Dónde se ve | Por qué cambia | Entrega |
|---|---|---|---|
| `missingFormulaDataMessage`: 'La fecha de nacimiento se carga en "Datos".' y '… se cargan en "Evolución".' | Ficha, consulta, estudio ISAK (solo panel) | Las pestañas "Datos" y "Evolución" dejan de existir. Pasan a `"Editar datos"` y `"Historial"`. | 017c-2 |
| `ISAK_TEXT.deleteDescription` / `deleteWithReportDescription` ("No se puede deshacer.") y `REQUIREMENT_TEXT.deleteConfirmDescription` ("No se puede deshacer.") | Consulta, estudio ISAK (solo panel) | Con "Deshacer" (D12a) pasan a ser falsos. Se reemplazan por los textos de la tabla de confirmaciones de la HU §4.3. | 017c-3 |
| `ISAK_TEXT.deleted` ("Estudio ISAK borrado") y `REQUIREMENT_TEXT.deleted` ("Prescripción borrada") | Toast del panel | Pasan a "Estudio borrado" y "Cálculo borrado" (HU §2.3). | 017c-3 |

No se tocan `PEDIATRIC_TEXT`, `ISAK_REPORT_TEXT` (sale en el PDF y en el mensaje de WhatsApp),
`ACTIVITY_LEVELS` (la calculadora muestra "Moderado (×1,55)" a propósito, vocabulario clínico, D11a),
`CONSULTATION_TEXT`, `REQUIREMENT_TEXT.emptyInSummary` (deja de usarse, queda exportado) ni
`consultationChips` (se agrega una función nueva al lado, 017c-2).

---

# Entrega 017c-1: lista de pacientes y helpers puros (detallada)

## 1-1. Resumen funcional

La lista de `/pacientes` deja de ser una tabla y pasa a ser una **lista agrupada** en todos los
anchos, con un **buscador grande** (autofoco solo con puntero fino, atajo `/`, filtro mientras se
escribe, sin tildes ni formato). Cada fila muestra el **nombre** en grande y, debajo, el **próximo
turno en lenguaje común** ("Hoy, 16:30", "Mañana, 10:00", "Jueves 8 de octubre, 10:00 · Falta la
seña") o, si no hay, "Sin turno · Última consulta hace 3 semanas", y el **teléfono con formato**
("+54 9 351 555-2345"). Los contactos **sin nombre** van a una sección **"Por completar (N)"**,
cerrada por defecto, con **"Poner nombre"** (un Sheet con un solo campo que escribe solo
`Patient.name`). Los **grupos, canales y difusiones** (`@g.us`, `@newsletter`, `@broadcast`) no se
muestran ni se cuentan. Los `@lid` se muestran con "WhatsApp no muestra el número" y sin enlace a
WhatsApp. En la ficha, el encabezado actual pasa a mostrar el teléfono con formato y esconde el botón
de WhatsApp para los `@lid` (lo único de la ficha que toca esta entrega). Los helpers puros (contacto
de WhatsApp, teléfono, fechas, directorio) quedan en `packages/core` para las entregas siguientes.

## 2-1. Workspaces afectados

| Workspace | ¿Se toca? | Detalle |
|---|---|---|
| `packages/core` | **sí** | 4 módulos nuevos + sus tests + `export *` en `index.ts`. Solo agrega exports, no cambia ninguno existente. |
| `packages/db` | **no** | Ni schema ni `domain/`. |
| `apps/web` | **sí** | `/pacientes` (página, componente cliente, loading, action), `GroupedListRow` (prop opcional), `skeletons.tsx`, un hook nuevo, `patient-header.tsx` y `pacientes/[id]/page.tsx` (solo el teléfono y el botón de WhatsApp). |
| `apps/bot` | **no** | No importa ninguno de los módulos nuevos. Se corre su `typecheck` igual, porque core cambia. |

## 3-1. Esquema

**No cambia. Sin migración.** La entrega lee `Patient` (`id`, `name`, `phone`, `whatsappJid`,
`createdAt`), el próximo `Appointment` por paciente, la última `Consultation` por paciente y
`ConversationState.updatedAt` (por `patientJid`), y escribe solo `Patient.name`.

## 4-1. Contrato compartido

### 4.1 `packages/core/src/whatsapp-contact.ts` (nuevo)

Consumidor: `apps/web` (lista, ficha; en 017c-4 también el informe). El bot no lo usa.

```ts
export type WhatsappContactKind = "phone" | "hidden" | "not_person";

/** Clasifica un JID por su sufijo (sin distinguir mayúsculas):
 *  "@s.whatsapp.net" y "@c.us" → "phone";
 *  "@lid" → "hidden" (WhatsApp oculta el número);
 *  "@g.us", "@newsletter", "@broadcast" (incluye "status@broadcast") → "not_person";
 *  sin "@" o con un sufijo desconocido → "hidden" (se muestra, pero sin número ni enlace:
 *  esconder a una persona real sería peor que mostrar un contacto raro). */
export function classifyWhatsappJid(jid: string): WhatsappContactKind;

/** true salvo "not_person". */
export function isPersonJid(jid: string): boolean;

/** "https://wa.me/<dígitos de phone>" solo si el JID es "phone" y `phone` tiene dígitos; si no, null. */
export function whatsappChatUrl(contact: { whatsappJid: string; phone: string }): string | null;

/** Texto exacto para los "hidden". */
export const HIDDEN_NUMBER_TEXT = "WhatsApp no muestra el número";
```

### 4.2 `packages/core/src/phone-format.ts` (nuevo)

Consumidor: `apps/web`. Sin librerías nuevas (D6: `libphonenumber-js` no se justifica para un
consultorio argentino; ver los casos de tests).

```ts
/** Formatea un número internacional en dígitos (acepta "+", espacios y guiones: se descartan).
 *  - "" → "".
 *  - Menos de 8 dígitos → los dígitos tal cual (no es un número internacional completo).
 *  - Argentina con móvil: "549" + 10 dígitos nacionales → "+54 9 <área> <abonado>".
 *  - Argentina fijo: "54" + 10 dígitos nacionales (sin el 9) → "+54 <área> <abonado>".
 *    En los dos casos, solo si el número nacional empieza con "11", "2" o "3" (los códigos de área
 *    argentinos); si no, se usa el formato genérico.
 *    Área: "11" (2 dígitos); 3 dígitos si está en AR_AREA_CODES_3; si no, 4 dígitos.
 *    Abonado = el resto (8, 7 o 6 dígitos), con guion antes de los últimos 4:
 *    "2345-6789", "555-2345", "12-3456".
 *  - Cualquier otro caso (otro país, o "54" con un largo que no cierra): "+<código> <grupos>".
 *    Código de país: 1 dígito si empieza con 1 o 7; 2 dígitos si está en COUNTRY_CODES_2; si no, 3.
 *    El resto se agrupa desde la derecha: un grupo final de 4 y grupos de 3 hacia la izquierda; si el
 *    primer grupo queda de 1 dígito, se une al siguiente. Separador: espacio. */
export function formatPhone(raw: string): string;

/** Códigos de área argentinos de 3 dígitos (sin el 0): 220, 221, 223, 230, 236, 237, 249, 260, 261,
 *  263, 264, 266, 280, 291, 294, 297, 298, 299, 336, 341, 342, 343, 345, 348, 351, 353, 358, 362, 364,
 *  370, 376, 379, 380, 381, 383, 385, 387, 388. */
export const AR_AREA_CODES_3: ReadonlySet<string>;

/** Códigos de país de 2 dígitos: 20, 27, 30–34, 36, 39, 40, 41, 43–49, 51–58, 60–66, 81, 82, 84, 86,
 *  90–95, 98. */
export const COUNTRY_CODES_2: ReadonlySet<string>;
```

### 4.3 `packages/core/src/relative-date.ts` (nuevo)

Consumidor: `apps/web` (lista ahora; Resumen, Consultas, Historial e informe después). Todo en la
zona horaria que se pasa (`Professional.timezone`), nunca en la del proceso. Usa `dayKeyInTz` y
`formatInTimeZone` (ya en core) y `date-fns/locale/es`.

```ts
/** Días calendario entre dos "yyyy-MM-dd" (to − from), sin depender de la zona del proceso. */
export function calendarDaysBetween(fromDayKey: string, toDayKey: string): number;

/** Primera letra en mayúscula ("jueves" → "Jueves"). */
export function capitalizeFirst(text: string): string;

/** Cuándo es un turno, en lenguaje común (hora "H:mm", sin cero adelante):
 *  mismo día que `now` → "Hoy, 16:30"; día siguiente → "Mañana, 10:00";
 *  mismo año → "Jueves 8 de octubre, 10:00"; otro año → "Lunes 4 de enero de 2027, 9:00".
 *  Un instante pasado del mismo día también es "Hoy, …" (quien llama ya filtra futuros). */
export function formatAppointmentWhen(startsAt: Date, now: Date, tz: string): string;

/** Hace cuánto, por días calendario en `tz` (d = días entre el día de `past` y el de `now`):
 *  d ≤ 0 → "hoy" (incluye fechas futuras); 1 → "ayer"; 2–6 → "hace d días";
 *  7–29 → "hace N semana(s)" con N = floor(d/7); 30–364 → "hace N mes(es)" con
 *  N = min(11, max(1, floor(d/30))); ≥ 365 → "hace N año(s)" con N = floor(d/365).
 *  En minúscula: quien llama compone ("Última consulta hace 3 semanas", "escribió ayer"). */
export function formatTimeAgo(past: Date, now: Date, tz: string): string;
```

### 4.4 `packages/core/src/patient-directory.ts` (nuevo)

Consumidor: `apps/web/src/app/(panel)/pacientes/page.tsx` (arma las filas en el servidor) y
`patient-directory.tsx` (filtra en el cliente). Usa `normalize` (de `wake.ts`), 4.1, 4.2 y 4.3.

```ts
export interface PatientDirectoryInput {
  id: string;
  name: string | null;
  phone: string;
  whatsappJid: string;
  createdAt: Date;
  /** Próximo turno CONFIRMED o AWAITING_PAYMENT con startsAt >= now (el más cercano), o null. */
  nextAppointment: { startsAt: Date; status: "CONFIRMED" | "AWAITING_PAYMENT" } | null;
  /** consultedAt de la consulta más reciente, o null. */
  lastConsultationAt: Date | null;
  /** ConversationState.updatedAt del JID, o null si no hay fila. */
  lastContactAt: Date | null;
}

export interface PatientDirectoryRow {
  id: string;
  /** Nombre recortado (trim); null si no tiene o es solo espacios. */
  name: string | null;
  contactKind: "phone" | "hidden";
  /** formatPhone(phone) si contactKind = "phone"; null si "hidden". */
  phoneLabel: string | null;
  /** Solo dígitos de phone si "phone"; null si "hidden" (los dígitos de un @lid no se buscan). */
  phoneDigits: string | null;
  /** normalize(name ?? ""), para buscar. */
  searchName: string;
  /** Solo filas con nombre (en las sin nombre, ""). Ver reglas abajo. */
  statusLine: string;
  /** Solo filas sin nombre (en las con nombre, ""): "escribió " + formatTimeAgo(lastContactAt ?? createdAt). */
  lastContactLabel: string;
}

export interface PatientDirectory {
  /** Con nombre, orden alfabético con Intl.Collator("es", { sensitivity: "base", numeric: true });
   *  empate por id. */
  named: PatientDirectoryRow[];
  /** Sin nombre, del contacto más reciente al más viejo (lastContactAt ?? createdAt, desc). */
  unnamed: PatientDirectoryRow[];
}

/** Descarta los "not_person" y arma las filas.
 *  statusLine:
 *   - con próximo turno: formatAppointmentWhen(...) y, si AWAITING_PAYMENT, + " · Falta la seña";
 *   - sin turno y con consulta: "Sin turno · Última consulta " + formatTimeAgo(lastConsultationAt);
 *   - sin turno, sin consulta y con lastContactAt: "Sin turno · Te escribió " + formatTimeAgo(lastContactAt);
 *   - si no: "Sin turno". Nunca "—". */
export function buildPatientDirectory(input: readonly PatientDirectoryInput[], now: Date, tz: string): PatientDirectory;

/** ¿La fila coincide con lo que se escribió? Vacío o solo espacios → true.
 *  - Sin letras (solo dígitos, espacios, "+", "-", "(", ")", "."): se juntan los dígitos; si empiezan
 *    con "0", se prueba también sin ese 0. Coincide si phoneDigits los contiene. Con phoneDigits null → false.
 *  - Con letras: se parte en palabras (normalize + espacios). Cada palabra con letras tiene que estar en
 *    searchName; cada palabra solo de dígitos, en phoneDigits. Todas tienen que coincidir, en cualquier orden. */
export function matchesPatientQuery(row: Pick<PatientDirectoryRow, "searchName" | "phoneDigits">, query: string): boolean;

/** "12 pacientes", "1 paciente"; buscando: "3 de 12". */
export function patientCountLabel(shown: number, total: number, searching: boolean): string;

export const PATIENT_DIRECTORY_TEXT = {
  title: "Pacientes",
  searchLabel: "Buscar pacientes por nombre o teléfono",
  searchPlaceholder: "Buscá por nombre o teléfono",
  clearSearch: "Borrar búsqueda",
  emptyTitle: "Todavía no hay pacientes",
  emptyDescription: "Aparecen acá cuando alguien te escribe por WhatsApp o cuando cargás un turno.",
  noResultsTitle: (q: string) => `No encontramos a «${q}»`,
  noResultsDescription: "Probá con otra parte del nombre o con el teléfono.",
  incompleteTitle: (n: number) => `Por completar (${n})`,
  incompleteDescription: "Contactos que te escribieron y todavía no tienen nombre.",
  unnamedLabel: "Sin nombre",
  setName: "Poner nombre",
  setNameTitle: "Poner nombre",
  setNameField: "Nombre y apellido",
  save: "Guardar",
  cancel: "Cancelar",
  setNameDone: (name: string) => `Listo, ${name} ya está en tus pacientes`,
  nameRequired: "Escribí el nombre",
  nameTooLong: "El nombre puede tener hasta 120 caracteres",
  saveError: "No se pudo guardar. Probá de nuevo.",
} as const;
```

`packages/core/src/index.ts`: agregar `export * from "./whatsapp-contact";`, `"./phone-format"`,
`"./relative-date"` y `"./patient-directory"`. Verificado: ninguno de los nombres nuevos choca con
exports existentes.

### 4.5 `apps/web`: action nueva en `pacientes/actions.ts` (`"use server"`)

```ts
export type SetPatientNameState = { ok: boolean; error?: string; name?: string };

/** Escribe SOLO Patient.name (no toca notes, birthDate ni nada más).
 *  FormData: id (string no vacío), name.
 *  name: trim; "" → { ok: false, error: PATIENT_DIRECTORY_TEXT.nameRequired };
 *        > 120 → { ok: false, error: PATIENT_DIRECTORY_TEXT.nameTooLong }.
 *  prisma.patient.update({ where: { id }, data: { name } }); si tira (p. ej. P2025) →
 *  { ok: false, error: PATIENT_DIRECTORY_TEXT.saveError }.
 *  Éxito: revalidatePath("/pacientes"), revalidatePath(`/pacientes/${id}`) → { ok: true, name }. */
export async function setPatientNameAction(prev: SetPatientNameState, formData: FormData): Promise<SetPatientNameState>;
```

- El archivo sigue exportando solo funciones async y `export type` declarados ahí (Turbopack rechaza
  otros exports en `"use server"`, incidente de 018a-2). `updatePatientAction` y
  `updateFormulaDataAction` no cambian.
- No se valida el tipo de contacto: un `not_person` no aparece en la lista, así que no hay botón.

### 4.6 `apps/web`: cambios de UI con contrato

| Archivo | Cambio | Compatibilidad |
|---|---|---|
| `components/grouped-list.tsx` | `GroupedListRow` suma `size?: "md" \| "lg"` (default `"md"`, igual que hoy). `"lg"`: fila `min-h-14` (56 px) y `py-3`; `label` en `text-headline` (17 px semibold); `description` en `text-callout` (14 px) gris, puede ocupar 2 líneas. | Prop opcional (R1). Hoy solo lo usa `/dev-diseno`. |
| `components/skeletons.tsx` | Nuevo `GroupedListSkeleton({ rows = 8, bare }: { rows?: number; bare?: boolean })`: `GroupedList` con `rows` filas de 56 px, cada una con una barra de 40 % (nombre) y otra de 65 % (segunda línea), separador hairline. | Export nuevo. |
| `lib/use-media-query.ts` (nuevo, `"use client"`) | `export function useMediaQuery(query: string, serverDefault?: boolean): boolean` con `useSyncExternalStore` sobre `window.matchMedia(query)`; en el servidor devuelve `serverDefault ?? false`. | Nuevo. |

### 4.7 Rutas, server actions y API

| Ruta / action | Cambio |
|---|---|
| `/pacientes` (`page.tsx`) | Nueva consulta de lectura (sección 7-1). Sin `searchParams`: la búsqueda es solo de cliente, como hoy. |
| `setPatientNameAction` | Nueva (4.5). |
| `/pacientes/[id]` | Solo el encabezado (teléfono con formato, WhatsApp oculto para `hidden`). |

No hay API nueva. **Mensajes del bot: ninguno** (la entrega no toca `apps/bot` ni textos de
WhatsApp).

## 5-1. Diseño de la lista (lo que implementa el implementer)

### 5.1 Estructura de `/pacientes`

```
PageHeader title="Pacientes" (sin description)          ← text-title-1
<form role="search">                                     ← ancho de la columna (max-w-3xl)
  [🔍  Buscá por nombre o teléfono              (×)]     ← h-12 (48 px), text-body-lg (17 px)
</form>
"12 pacientes" / "3 de 12"                               ← text-footnote gris, aria-live="polite"
GroupedList (filas size="lg", href a la ficha)
  Nombre                                              ›
  Hoy, 16:30 · +54 9 351 555-2345
▸ Por completar (4)                                      ← botón de disclosure, cerrado
  Contactos que te escribieron y todavía no tienen nombre.
  GroupedList de filas propias (5.4)
```

- Columna de `max-w-3xl` alineada a la izquierda en todos los anchos (a 1366 px una fila de 1100 px
  se lee mal). Sin tabla, sin ordenamiento por columnas, sin scroll horizontal.
- `PatientsList` (`patients-list.tsx`) se borra; lo reemplaza `patient-directory.tsx`. `DataTable`
  sigue existiendo (lo usan otras pantallas).

### 5.2 Buscador

- `<label class="sr-only">` con `PATIENT_DIRECTORY_TEXT.searchLabel`; `placeholder` =
  `searchPlaceholder`. `type="search"`, `inputMode="search"`, `enterKeyHint="search"`,
  `autoComplete="off"`, `autoCorrect="off"`, `spellCheck={false}`, `aria-keyshortcuts="/"`. Se
  ocultan la cruz nativa de WebKit y el borde de foco nativo (el foco es el de `inputClass`).
- Clases: `inputClass` + `h-12 rounded-lg pl-11 pr-12 text-body-lg` (ícono `Search` de 20 px a la
  izquierda, `aria-hidden`).
- **Autofoco (D13):** en un `useEffect` de montaje, `if (window.matchMedia("(pointer: fine)").matches)
  inputRef.current?.focus({ preventScroll: true })`. **No** se usa el atributo `autoFocus` (abriría
  el teclado en el celular).
- **Atajo `/` (Q3):** listener `keydown` en `document`: si la tecla es `/`, sin Ctrl/Meta/Alt, y el
  foco no está en un `input`, `textarea`, `select` ni `[contenteditable]`, y no hay un
  `[role="dialog"]` abierto → `preventDefault()` y foco al buscador.
- **Filtro:** estado local `q`; filtra en cada cambio (sin Enter, sin debounce: son decenas de filas)
  con `matchesPatientQuery` sobre `named` y `unnamed`.
- **Enter (Q4):** si hay al menos una fila con nombre que coincide, `router.push` a la ficha de la
  primera. Si no, nada.
- **Botón "×"** (solo con `q` no vacío): `Button variant="plain" size="icon-lg"` (44 px),
  `aria-label={clearSearch}`, ícono `X`. Limpia `q` y devuelve el foco al buscador. Escape dentro del
  buscador hace lo mismo.

### 5.3 Filas con nombre

- `GroupedListRow size="lg" href={`/pacientes/${id}`}` (chevron incluido, press de fila de 017a).
- `label` = nombre. `description` = `statusLine` + (si `phoneLabel`) `" · "` + `phoneLabel` en un
  `<span class="whitespace-nowrap tabular-nums">`. Para los `@lid` con nombre no se agrega nada
  (Q2).
- Contador: `patientCountLabel(namedFiltrados, named.length, q.trim() !== "")`.

### 5.4 Sección "Por completar"

- Se muestra si `unnamed.length > 0`. Sin búsqueda: cerrada por defecto. Con búsqueda: visible solo
  si hay coincidencias, y entonces **abierta** (`open = abiertaPorUsuario || (buscando &&
  coincidencias > 0)`).
- Disclosure: `<button aria-expanded aria-controls>` de 44 px de alto con `ChevronRight` que rota 90°
  (transform, `springs.quick`; con movimiento reducido, sin rotación animada) y el texto
  `incompleteTitle(n)` en `text-headline`. Debajo, `incompleteDescription` en `text-footnote` gris.
  El contenido entra con `AnimatePresence` + `m.div` de opacidad (`fades.fast`), sin animar la
  altura (T7).
- Filas propias (`IncompleteContactRow`, en el mismo archivo), dentro de `GroupedList`, con las
  mismas clases de fila y separador que `GroupedListRow`:
  - Zona izquierda: `Link` a la ficha (`flex-1`, press de fila, `min-h-14`) con `label` = `phoneLabel`
    o `HIDDEN_NUMBER_TEXT`, y `description` = `lastContactLabel` (con búsqueda:
    `"Sin nombre · " + lastContactLabel`). Q5.
  - Derecha, fuera del Link: `Button variant="tinted" size="md"` con `Pencil` + `setName`, con
    `touch-target`. Abre el Sheet de 5.5 para esa fila.

### 5.5 Sheet "Poner nombre" (`name-contact-sheet.tsx`, nuevo)

- Un solo `Sheet` controlado en `patient-directory.tsx` (estado `editing: PatientDirectoryRow | null`).
  `side` = `"bottom"` si `useMediaQuery("(max-width: 639px)")`, si no `"right"` con
  `className="w-full sm:max-w-md"`.
- `SheetTitle` = `setNameTitle`; `SheetDescription` = el teléfono con formato o `HIDDEN_NUMBER_TEXT`.
- `<form action={formAction} noValidate>` con `useActionState(setPatientNameAction, { ok: false })`:
  `input type="hidden" name="id"`; `Field label={setNameField}` con `Input name="name"
  autoFocus maxLength={120} autoComplete="off" className="h-11"` y `aria-invalid` si hay error;
  `FormError` debajo (`role="alert"`). Botones: `Button type="submit" size="lg" loading` "Guardar" y
  `SheetClose asChild` → `Button variant="secondary" size="lg"` "Cancelar". En el celular, a lo
  ancho y apilados (Guardar arriba).
- Al volver `ok`: cerrar el Sheet, `notify.saved(setNameDone(state.name))`. La revalidación de la
  action refresca la lista: el contacto pasa a `named` en su lugar alfabético.
- **Foco al cerrar:** la fila que abrió el Sheet desaparece, así que `onCloseAutoFocus` hace
  `preventDefault()` y lleva el foco al buscador cuando se guardó. Si se canceló, el foco vuelve al
  botón "Poner nombre" (comportamiento por defecto).

### 5.6 Estados

| Estado | Qué se ve |
|---|---|
| Sin pacientes (`named` y `unnamed` vacíos) | `EmptyState` con `Users`, `emptyTitle`, `emptyDescription`. Sin buscador. |
| Solo contactos sin nombre | Buscador, contador "0 pacientes", `EmptyState` corto con `emptyTitle` y la sección "Por completar". |
| Búsqueda sin resultados (ni con nombre ni sin nombre) | `EmptyState` con `SearchX`, `noResultsTitle(q.trim())`, `noResultsDescription` y `Button variant="secondary"` `clearSearch` (limpia y enfoca el buscador). |
| Búsqueda con resultados solo en "Por completar" | Contador "0 de 12", sin EmptyState, "Por completar" abierta. |
| Cargando | `pacientes/loading.tsx`: skeleton de título (h-8 w-40), buscador (h-12, ancho completo de la columna), contador (h-3 w-24) y `GroupedListSkeleton rows={8} bare`, dentro de un `role="status"` con "Cargando…". |

### 5.7 Ficha: lo único que cambia en esta entrega

`patient-header.tsx` recibe `whatsappJid` y:
- muestra `formatPhone(phone)` si `classifyWhatsappJid(whatsappJid) === "phone"`, y si no
  `HIDDEN_NUMBER_TEXT`;
- arma el `href` con `whatsappChatUrl(...)`; si da `null`, **no** muestra el botón "Abrir chat de
  WhatsApp" (D3).

`pacientes/[id]/page.tsx` le pasa `whatsappJid={patient.whatsappJid}`. Nada más de la ficha cambia
hasta 017c-2.

## 6-1. Pantallas (skill `ui`)

| Vista | Estructura base | Componentes clave | Objetivo UX que resuelve |
|---|---|---|---|
| **Pacientes: lista** (1366, 768, 390 px) | Shell del panel (sidebar o topbar móvil) + columna `max-w-3xl`: título, buscador, contador, lista. | `PageHeader`, `Input` grande con ícono y "×", `GroupedList` + `GroupedListRow size="lg"`, contador `aria-live`. | Encontrar a una paciente escribiendo, sin hacer clic; leer quién es y cuándo viene de un vistazo. |
| **Pacientes: búsqueda sin resultados** | Igual, con un `EmptyState` en lugar de la lista. | `EmptyState` + `Button` "Borrar búsqueda". | Saber qué hacer cuando no aparece nadie. |
| **Por completar (abierta)** | Bloque debajo de la lista. | Disclosure (botón + chevron), `GroupedList` con filas propias (Link + `Button tinted`). | Separar contactos sin nombre de las pacientes, sin perderlos. |
| **Sheet "Poner nombre"** | Lateral derecho (≥ 640 px) o desde abajo (< 640 px). | `Sheet`, `Field` + `Input`, `FormError`, `Button lg` ×2, toast de éxito. | Completar un contacto en 3 toques sin tocar otros datos. |
| **Cargando** | Igual que la lista. | `Skeleton`, `GroupedListSkeleton`. | No ver un salto de layout al cargar. |

## 7-1. Archivos y flujo

### 7.1 Datos de `/pacientes/page.tsx` (servidor)

1. `const now = new Date()`.
2. En paralelo: `getProfessional()`;
   `prisma.patient.findMany({ select: { id, name, phone, whatsappJid, createdAt, appointments: {
   where: { status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] }, startsAt: { gte: now } }, orderBy: {
   startsAt: "asc" }, take: 1, select: { startsAt, status } }, consultations: { orderBy: {
   consultedAt: "desc" }, take: 1, select: { consultedAt } } } })` (sin `orderBy`: ordena core);
   `prisma.conversationState.findMany({ select: { patientJid, updatedAt } })`.
   Son 3 consultas de lectura más las 2 que Prisma agrega por las relaciones; **no** hay N+1. Los
   volúmenes son de decenas a pocos cientos de filas.
3. Mapa `patientJid → updatedAt`; armar `PatientDirectoryInput[]`.
4. `buildPatientDirectory(inputs, now, pro.timezone)` → `{ named, unnamed }` (solo strings, se
   serializa directo al cliente).
5. `<PageHeader title=… />` + `<PatientDirectory named={…} unnamed={…} />`.

`export const dynamic = "force-dynamic"` se mantiene.

### 7.2 Archivos

| Archivo | Acción |
|---|---|
| `packages/core/src/whatsapp-contact.ts` + `.test.ts` | crear |
| `packages/core/src/phone-format.ts` + `.test.ts` | crear |
| `packages/core/src/relative-date.ts` + `.test.ts` | crear |
| `packages/core/src/patient-directory.ts` + `.test.ts` | crear |
| `packages/core/src/index.ts` | 4 `export *` |
| `apps/web/src/components/grouped-list.tsx` | prop `size` opcional |
| `apps/web/src/components/skeletons.tsx` | `GroupedListSkeleton` |
| `apps/web/src/lib/use-media-query.ts` | crear |
| `apps/web/src/app/(panel)/pacientes/actions.ts` | `setPatientNameAction` + `SetPatientNameState` |
| `apps/web/src/app/(panel)/pacientes/actions.test.ts` | crear (mocks) |
| `apps/web/src/app/(panel)/pacientes/page.tsx` | reescribir (7.1) |
| `apps/web/src/app/(panel)/pacientes/patient-directory.tsx` | crear (`"use client"`: buscador, lista, "Por completar", Sheet) |
| `apps/web/src/app/(panel)/pacientes/name-contact-sheet.tsx` | crear (`"use client"`) |
| `apps/web/src/app/(panel)/pacientes/patients-list.tsx` | borrar |
| `apps/web/src/app/(panel)/pacientes/loading.tsx` | reescribir (5.6) |
| `apps/web/src/app/(panel)/pacientes/[id]/patient-header.tsx` | teléfono y botón WhatsApp (5.7) |
| `apps/web/src/app/(panel)/pacientes/[id]/page.tsx` | pasar `whatsappJid` (una línea) |

## 8-1. Checklist atómico (un commit por fase)

> Cada paso termina con el `typecheck` del workspace que toca en verde. `git add` solo de los
> archivos de la fase: el árbol tiene archivos ajenos sin trackear (`.mcp.json`,
> `docker-compose.prod.yml`, `hus-last-meet.md`, `apps/bot/.whatsapp-auth.vieja*/`,
> `docs/auditoria-apple/017a/`) que **no** se agregan. Trailer `Co-Authored-By` del implementer.

### Fase 0: preflight (sin commit)

- [ ] 0.1 `git status`, `git log -1` en `feat/hu-017c-pacientes`; `git fetch` y confirmar que la rama
      tiene `origin/develop` adentro (si hay commits nuevos en `develop`, `git rebase origin/develop`).
- [ ] 0.2 `npm run db:generate` (no toca la base). No correr `prisma migrate` (ver la nota de
      migraciones al principio).
- [ ] 0.3 Capturas **antes** (`npm run dev`, solo lectura): `/pacientes` a 1366×768, 768×1024 y
      390×844, y el encabezado de una ficha con `@lid` → `docs/auditoria-apple/017c/antes/` (no se
      commitean salvo pedido).
- [ ] 0.4 Abrir `progress/impl_HU-017c-1.md` con lo anterior.

### Fase 1: `packages/core` (commit `HU-017c-1: helpers de contacto, teléfono, fechas y directorio (core)`)

- [ ] 1.1 `whatsapp-contact.ts` + test (9-1). `npx vitest run packages/core/src/whatsapp-contact.test.ts`.
- [ ] 1.2 `phone-format.ts` + test.
- [ ] 1.3 `relative-date.ts` + test.
- [ ] 1.4 `patient-directory.ts` + test.
- [ ] 1.5 `index.ts` con los 4 `export *`. `npm run typecheck --workspace packages/core` y
      `npm run typecheck --workspace apps/bot` (core cambió).

### Fase 2: piezas de web (commit `HU-017c-1: GroupedListRow grande, skeleton, useMediaQuery y "Poner nombre" (action)`)

- [ ] 2.1 `GroupedListRow` con `size` opcional. Agregar una fila `size="lg"` en `/dev-diseno`
      (sección de listas) si la sección existe; verificar que las filas `md` no cambian.
- [ ] 2.2 `GroupedListSkeleton` en `skeletons.tsx`.
- [ ] 2.3 `lib/use-media-query.ts`.
- [ ] 2.4 `setPatientNameAction` en `pacientes/actions.ts` + `actions.test.ts` (9-1).
      `npm run typecheck --workspace apps/web` y `npm run test`.

### Fase 3: la lista (commit `HU-017c-1: lista de pacientes con buscador, próximo turno y "Por completar"`)

- [ ] 3.1 `page.tsx` con la consulta de 7.1 y `buildPatientDirectory`.
- [ ] 3.2 `patient-directory.tsx`: buscador (5.2), filas (5.3), contador, estados (5.6).
- [ ] 3.3 "Por completar" (5.4) con su disclosure y movimiento reducido.
- [ ] 3.4 `name-contact-sheet.tsx` (5.5) conectado a la action; foco al cerrar.
- [ ] 3.5 Borrar `patients-list.tsx`; `grep -rn "patients-list" apps/web/src` → vacío.
- [ ] 3.6 `loading.tsx` (5.6).
- [ ] 3.7 `npm run typecheck --workspace apps/web`, `npm run lint --workspace apps/web`.

### Fase 4: encabezado de la ficha (commit `HU-017c-1: teléfono con formato y sin WhatsApp para @lid en la ficha`)

- [ ] 4.1 `patient-header.tsx` y `page.tsx` (5.7).
- [ ] 4.2 `npm run typecheck --workspace apps/web`.

### Fase 5: verificación y cierre (commit `HU-017c-1: implementación y verificación`, solo `progress/impl_HU-017c-1.md`)

- [ ] 5.1 Todo 10-1 en verde, anotado en `progress/impl_HU-017c-1.md` (archivos, comandos y salida
      resumida, desvíos, capturas después en `docs/auditoria-apple/017c/despues/`).
- [ ] 5.2 Devolver `done -> progress/impl_HU-017c-1.md`.

## 9-1. Tests (vitest, `npm run test` desde la raíz)

Fixtures de fecha: `tz = "America/Argentina/Buenos_Aires"`, `now = 2026-10-05T13:00:00Z` (lunes 5 de
octubre de 2026, 10:00 en Argentina). Los ejemplos de la HU ("Jueves 9 de octubre", "Lunes 10 de
noviembre") son de 2025; los tests usan fechas de 2026 que caen en esos días de la semana.

**`whatsapp-contact.test.ts`**
- `"5493515552345@s.whatsapp.net"` → `"phone"`; `"5493515552345@c.us"` → `"phone"`;
  `"93127792677049@lid"` → `"hidden"`; `"120363000000000000@newsletter"` → `"not_person"`;
  `"5493515552345-1600000000@g.us"` → `"not_person"`; `"status@broadcast"` y `"123@broadcast"` →
  `"not_person"`; `"5493515552345"` (sin @) → `"hidden"`; `"x@desconocido"` → `"hidden"`;
  `"93127792677049@LID"` → `"hidden"` (mayúsculas).
- `isPersonJid`: falso solo para los `not_person`.
- `whatsappChatUrl({ whatsappJid: "…@s.whatsapp.net", phone: "5493515552345" })` →
  `"https://wa.me/5493515552345"`; con `@lid` → `null`; con `phone: ""` → `null`.

**`phone-format.test.ts`**
- `"5493515552345"` → `"+54 9 351 555-2345"`; `"+54 9 351 555-2345"` → igual (descarta formato).
- `"5491123456789"` → `"+54 9 11 2345-6789"`; `"5492954123456"` → `"+54 9 2954 12-3456"`.
- `"543515552345"` → `"+54 351 555-2345"`; `"541143214321"` → `"+54 11 4321-4321"`.
- `"549351555234"` (largo que no cierra; tampoco es fijo porque el nacional empezaría con 9) →
  `"+54 935 155 5234"` (genérico). `"5490000017001"` (nacional que empieza con 0) →
  `"+54 9000 001 7001"` (genérico, el primer grupo de 1 dígito se une al siguiente).
- `"15551234567"` → `"+1 555 123 4567"`; `"59899123456"` → `"+598 9912 3456"`;
  `"34612345678"` → `"+34 61 234 5678"`.
- `"12345"` → `"12345"`; `""` → `""`.

**`relative-date.test.ts`**
- `calendarDaysBetween("2026-10-05", "2026-10-08")` = 3; a través de fin de mes y de año
  (`"2026-12-31"` → `"2027-01-01"` = 1); negativo si `to < from`.
- `formatAppointmentWhen`: hoy 16:30 (`2026-10-05T19:30Z`) → `"Hoy, 16:30"`; hoy 23:30
  (`2026-10-06T02:30Z`, ya es otro día en UTC) → `"Hoy, 23:30"`; mañana 10:00 → `"Mañana, 10:00"`;
  jueves 8/10 10:00 → `"Jueves 8 de octubre, 10:00"`; lunes 9/11 9:00 → `"Lunes 9 de noviembre, 9:00"`;
  4/1/2027 9:00 → `"Lunes 4 de enero de 2027, 9:00"`; con `now = 2026-10-06T01:00Z` (lunes 22:00 en
  Argentina) y turno el 6/10 10:00 → `"Mañana, 10:00"` (no "Hoy").
- `formatTimeAgo` con el `now` fijo: mismo día → `"hoy"`; `2026-10-05T02:00Z` (domingo 23:00 en
  Argentina) → `"ayer"`; 3 días → `"hace 3 días"`; 6 → `"hace 6 días"`; 7 y 13 → `"hace 1 semana"`;
  14 → `"hace 2 semanas"`; 21 → `"hace 3 semanas"`; 29 → `"hace 4 semanas"`; 30 y 59 →
  `"hace 1 mes"`; 60 → `"hace 2 meses"`; 364 → `"hace 11 meses"`; 365 → `"hace 1 año"`; 800 →
  `"hace 2 años"`; una fecha futura → `"hoy"`.
- `capitalizeFirst("jueves")` → `"Jueves"`; `""` → `""`.

**`patient-directory.test.ts`**
- Descarta `@newsletter`, `@g.us` y `@broadcast`; quedan los `phone` y los `hidden`.
- `named` en orden es-AR: entrada `["Oscar", "Ñandú", "Beto", "Ana", "álvaro", "Nzeta"]` →
  `["álvaro", "Ana", "Beto", "Nzeta", "Ñandú", "Oscar"]` (tildes y mayúsculas no cambian el orden;
  la "ñ" va después de toda la "n", que es lo que distingue al collator `es`).
- `name: "   "` → va a `unnamed`, con `name: null`.
- `unnamed` ordenados por `lastContactAt ?? createdAt` desc.
- `statusLine`: turno hoy → `"Hoy, 16:30"`; `AWAITING_PAYMENT` → `"Jueves 8 de octubre, 10:00 · Falta la seña"`;
  sin turno + consulta hace 21 días → `"Sin turno · Última consulta hace 3 semanas"`; consulta hoy →
  `"Sin turno · Última consulta hoy"`; sin consulta + contacto hace 2 días → `"Sin turno · Te escribió hace 2 días"`;
  sin nada → `"Sin turno"`; nunca contiene `"—"`.
- `lastContactLabel` de una fila sin nombre y sin `ConversationState` → `"escribió " + formatTimeAgo(createdAt)`.
- `@lid`: `phoneLabel` y `phoneDigits` `null`, `contactKind: "hidden"`.
- `matchesPatientQuery` con "María José Gómez" / `5493515552345`: `"maria jose"`, `"jose gomez"`,
  `"GÓMEZ maría"`, `"555 2345"`, `"3515552345"`, `"+54 9 351 555-2345"`, `"0351 555 2345"` → true;
  `"maria 555"` → true (palabra de dígitos contra el teléfono); `"maria 999"` → false; `"pedro"` →
  false; `""` y `"   "` → true. Una fila `hidden` con `"9312"` → false.
- `patientCountLabel(12, 12, false)` = `"12 pacientes"`; `(1, 1, false)` = `"1 paciente"`;
  `(3, 12, true)` = `"3 de 12"`.

**`apps/web/src/app/(panel)/pacientes/actions.test.ts`** (patrón de `report-actions.test.ts`:
`vi.mock("@nutri-bot/db", …)` y `vi.mock("next/cache", …)`)
- Con `name: "  Lucía Pérez  "` → `prisma.patient.update` se llama con
  `{ where: { id }, data: { name: "Lucía Pérez" } }` (**exactamente** esa `data`, sin `notes` ni
  `birthDate`) y devuelve `{ ok: true, name: "Lucía Pérez" }`; revalida `/pacientes` y la ficha.
- `name: "   "` → `{ ok: false, error: "Escribí el nombre" }` y no llama a `update`.
- 121 caracteres → `nameTooLong`, sin `update`.
- `update` que tira → `{ ok: false, error: "No se pudo guardar. Probá de nuevo." }`.

## 10-1. Verificación (antes de declararse `done`)

### 10.1 Comandos (desde la raíz)

```bash
npm run db:generate
npm run typecheck                     # core, db, web y bot en verde
npm run test                          # vitest de todo el monorepo (sin base ni red)
npm run lint --workspace apps/web     # sin warnings nuevos (el de ajustes/logo-form.tsx es previo)
./ops/harness/verify.sh               # "Arnés OK"
```

**Builds (webpack y Turbopack).** Si el usuario tiene `npm run dev` corriendo, no se hace el build
en `apps/web/.next` (pisaría su servidor). Se hace en una copia, como en 018a-2/018c:

```bash
SCR=<scratchpad>/build-017c1 && rm -rf "$SCR" && mkdir -p "$SCR"
rsync -a --exclude node_modules --exclude .next --exclude .git ./ "$SCR/"
cp -c -R node_modules "$SCR/node_modules"
cp -c -R apps/web/node_modules "$SCR/apps/web/node_modules" 2>/dev/null || true
cp .env "$SCR/.env"
cd "$SCR" && npm run build --workspace apps/web          # next build (webpack): exit 0
cd "$SCR/apps/web" && npx next build --turbopack         # "Compiled successfully", exit 0
cd - && rm -rf "$SCR"
```

Las dos tienen que compilar `/pacientes` y `/pacientes/[id]` sin el error "Only async functions are
allowed to be exported in a "use server" file".

### 10.2 Alcance del diff

```bash
git diff origin/develop --stat
git diff origin/develop --name-only | grep -E 'app/\(panel\)/(alimentos|plantillas)/|pacientes/\[id\]/planes/|components/(food-picker|meals-editor)\.tsx|lib/(plan-pdf|pdf-theme)\.tsx?$|pacientes/\[id\]/plans-section\.tsx'   # → vacío
git diff origin/develop --name-only | grep -E '^(apps/bot|packages/db|backlog)/'      # → vacío
git diff origin/develop --name-only | grep -E 'schema\.prisma|/migrations/'           # → vacío
```

### 10.3 Recorrido en Chrome (orquestador)

Con `npm run dev` (Turbopack, :3000), logueado. Sin bot ni WhatsApp. Anchos: 1366×768, 768×1024 y
390×844 (emulación táctil en 390).

**Datos de prueba (los crea el recorrido y los borra por id).** No se crean turnos: un turno nuevo
puede disparar la sincronización con Google Calendar y los crons de confirmación del bot (T8). El
próximo turno se mira con los turnos que ya existen (solo lectura) y está cubierto por los tests.

```bash
# Verificar antes que los JID no existan (debe dar 0):
docker compose exec -T db psql -U nutri -d nutribot -c "select count(*) from \"Patient\" where \"whatsappJid\" in ('5493510017001@s.whatsapp.net','900000017002@lid','120363000000017003@newsletter');"
# Crear:
docker compose exec -T db psql -U nutri -d nutribot -c "insert into \"Patient\" (id, \"whatsappJid\", phone, name, notes, \"birthDate\", \"createdAt\", \"updatedAt\") values
 ('hu017c1-sin-nombre', '5493510017001@s.whatsapp.net', '5493510017001', null, 'Nota de prueba 017c', '1990-05-10', now(), now()),
 ('hu017c1-lid',        '900000017002@lid',             '900000017002',  null, null, null, now(), now()),
 ('hu017c1-canal',      '120363000000017003@newsletter', '120363000000017003', null, null, null, now(), now());"
# Borrar al final (SOLO por id):
docker compose exec -T db psql -U nutri -d nutribot -c "delete from \"Patient\" where id in ('hu017c1-sin-nombre','hu017c1-lid','hu017c1-canal');"
```

Pasos:
1. **1366×768:** abrir "Pacientes" desde la sidebar. El cursor está en el buscador sin hacer clic; el
   buscador ocupa el ancho de la columna, mide 48 px y el texto es de 17 px (DevTools → Computed). El
   placeholder dice "Buscá por nombre o teléfono".
2. Escribir una parte del nombre de una paciente real sin tildes y en minúsculas → aparece mientras
   se escribe; el contador dice "N de M". Escribir parte de su teléfono con espacios → aparece.
3. Escribir "zzzz" → "No encontramos a «zzzz»", la sugerencia y "Borrar búsqueda"; tocarlo → lista
   completa y cursor en el buscador.
4. Cada fila: nombre en 17 px semibold, segunda línea gris de 14 px con el próximo turno o "Sin turno
   · …" y el teléfono "+54 9 …". Ningún "—". Fila ≥ 56 px, se resalta al presionar, lleva a la ficha.
5. "Por completar (N)" al final, cerrada; N cuenta a `hu017c1-sin-nombre` y `hu017c1-lid` (más los
   reales sin nombre). Abrirla: el de prueba muestra `+54 9 351 001-7001` (número ficticio con formato argentino; la regla
   de 4.2 lo toma con área 351) y el `@lid` dice "WhatsApp no muestra el número".
   Cada uno con "escribió hoy" y "Poner nombre". El canal `hu017c1-canal` **no** aparece en ningún
   lado ni con la búsqueda "120363".
6. "Poner nombre" en `hu017c1-sin-nombre` → Sheet con un solo campo y el cursor adentro. "Guardar"
   vacío → "Escribí el nombre" inline. Escribir "Prueba Lucía 017c" → "Guardar" → toast "Listo, Prueba
   Lucía 017c ya está en tus pacientes"; pasa a la lista principal en su lugar alfabético; el foco
   queda en el buscador. Verificar en la base que no se borró nada:
   `select name, notes, "birthDate" from "Patient" where id='hu017c1-sin-nombre';` →
   `Prueba Lucía 017c | Nota de prueba 017c | 1990-05-10`.
7. Buscar el teléfono del `@lid` de prueba ("900000017002") → **no** coincide (los dígitos de un
   `@lid` no se buscan). Buscar "001 7001" → aparece "Prueba Lucía 017c".
8. Abrir la ficha de un `@lid` real con nombre (solo mirar): dice "WhatsApp no muestra el número" y no
   está el botón de WhatsApp. En una `@s.whatsapp.net`: teléfono con formato y el botón abre
   `wa.me/549…` en otra pestaña (**no** escribir nada en WhatsApp; cerrar la pestaña).
9. **Teclado:** desde otra página, ir a Pacientes; en la lista, `Tab` sale del buscador a la primera
   fila; `/` desde una fila vuelve al buscador; Enter en el buscador con una coincidencia abre la
   ficha; el disclosure se abre con Enter/Espacio y anuncia el estado; el Sheet atrapa el foco y Esc
   lo cierra.
10. **768 y 390 px:** lista agrupada sin scroll horizontal (`document.documentElement.scrollWidth <=
    innerWidth`), nombre, segunda línea y chevron. A 390 px con emulación táctil: el teclado **no**
    se abre solo (el foco no está en el buscador al cargar); "×" y "Poner nombre" miden ≥ 44 px; el
    Sheet sale desde abajo.
11. **Movimiento reducido** (macOS o DevTools → Rendering → `prefers-reduced-motion: reduce`): abrir
    "Por completar" → fundido corto, el chevron cambia sin girar animado.
12. **Cargando:** DevTools → Network "Slow 3G", navegar a Pacientes → skeleton de lista agrupada, sin
    salto al aparecer los datos.
13. Borrar los 3 pacientes de prueba por id (comando de arriba) y verificar que el conteo de
    `Patient` volvió al de antes.

**Las tres tareas de D1** (Resolución D1: el orquestador las hace "como si fuera ella", pensando en
voz alta, y anota tiempos y dudas en `progress/recorrido_HU-017c-1.md`). En 017c-1 la ficha todavía
es la vieja, así que las tareas 2 y 3 dan la **línea de base** para comparar en 017c-2:
- **T1. Encontrar a una paciente y abrir su ficha** (1366×768 y 390 px), con el nombre dicho en voz
  alta y sin mirar la lista antes. Cronometrar desde que se abre "Pacientes" hasta que se ve la ficha.
  Meta: < 10 s, sin clic previo en el buscador en escritorio.
- **T2. Decir cuál fue su último peso** (en la ficha vieja). Cronometrar y anotar dónde se buscó
  primero.
- **T3. Empezar la consulta de hoy, o crear un plan.** En una paciente real **solo hasta abrir** el
  panel de "Nueva consulta" (se cancela, no se crea nada). Para completar el flujo, usar la paciente
  de prueba renombrada (paso 6) y borrar la consulta creada **por id** antes del paso 13
  (`delete from "Consultation" where id='<id>'`; `Patient` borra en cascada igual).
- Anotar cada duda o término que haría preguntar a la nutricionista. Si aparece algo que cambie
  017c-2 o 017c-3, el orquestador lo agrega acá antes de lanzar esa entrega. Queda pendiente del
  usuario repetirlo con la nutricionista.

## 11-1. Restricciones para el implementer

- **Datos de la base de desarrollo, regla dura (AGENTS.md):** ninguna verificación borra ni modifica
  datos de negocio preexistentes. Los tests de vitest usan mocks. El recorrido es del orquestador. No
  correr `db:seed`/`seed:demo`. No `prisma migrate` de ningún tipo.
- **WhatsApp, nunca mensajes reales:** nada de esta entrega encola en `OutboundMessage`. No se abre
  ningún chat ni se escribe en WhatsApp Web.
- No tocar la zona de imleticio (T6), ni `apps/bot/**`, `packages/db/**`, `backlog/**`.
- No cambiar firmas existentes de `ui.tsx`, primitivos, `grouped-list.tsx` ni de core; solo agregar.
- No correr `next build` en `apps/web/.next` con el `next dev` del usuario levantado (10.1).
- `"use server"`: solo funciones async y `export type` declarados en el archivo.

---

# Entrega 017c-2: ficha de 4 pestañas y Resumen

## 1-2. Resumen funcional

La ficha pasa de 7 a **4 pestañas** (Resumen, Consultas, Plan, Historial) con **alias** para los
`?tab=` viejos. Encabezado nuevo, sticky y translúcido (`material-chrome` con scroll edge): nombre
grande, edad, teléfono con formato, franja de antecedentes de riesgo y botón "WhatsApp". **Resumen**:
una sola acción principal ("Abrir la consulta de hoy" o "Nueva consulta"), cuatro tarjetas tocables
(Próximo turno, Última consulta, Plan, Peso con tendencia neutral y minigráfico), "Datos de la
paciente" en lenguaje común con "Ver detalle" para lo técnico, aviso de faltantes para calcular y un
único Sheet "Editar datos". **Historial**: `SegmentedControl` Peso y medidas · Turnos · Diario (los
tres montados). **Consultas** en lenguaje común. **Plan**: `plans-section.tsx` solo en lo visual.

## 2-2. Workspaces afectados

| Workspace | ¿Se toca? | Detalle |
|---|---|---|
| `packages/core` | **sí** | `patient-summary.ts` nuevo + test; `missingFormulaDataMessage` (texto, 0.1) y sus tests. |
| `packages/db` | **no** | |
| `apps/web` | **sí** | Ficha completa, `lib/patient-tab-route.ts` + test, action nueva de "Editar datos", deep link del calendario (Q7). |
| `apps/bot` | **no** | `typecheck` igual. |

## 3-2. Esquema

**No cambia.** "Editar datos" escribe campos existentes de `Patient` y `ClinicalRecord`.

## 4-2. Contrato

### 4.1 `packages/core/src/patient-summary.ts` (nuevo)

```ts
/** "24/09" en tz. */
export function formatShortDate(instant: Date, tz: string): string;

/** "Miércoles 24/09"; si es de otro año que now: "Miércoles 24/09/2025". */
export function formatConsultationDay(instant: Date, now: Date, tz: string): string;

export type RecordedItem = "peso" | "medidas" | "bioimpedancia" | "calorías" | "plan" | "notas";

/** Qué se registró en una consulta, en orden fijo. "peso" si alguna medición tiene weightKg;
 *  "medidas" si alguna tiene un campo de ANTHROPOMETRY_MEASURE_KEYS; "bioimpedancia" si alguna tiene
 *  uno de BIOIMPEDANCE_MEASURE_KEYS; "calorías" si hasPrescription; "plan" si hasPlan; "notas" si
 *  notes tiene texto (trim). Misma entrada que consultationChips. */
export function consultationRecordedItems(input: {
  measurements: MeasurementValues[]; hasPrescription: boolean; hasPlan: boolean; notes: string | null;
}): RecordedItem[];

/** "Peso, calorías y notas" (form "short") | "Se registró: peso, calorías y notas" (form "sentence");
 *  [] → "Sin registros". Unión es-AR: "a", "a y b", "a, b y c". */
export function recordedItemsText(items: readonly RecordedItem[], form: "short" | "sentence"): string;

export interface WeightPoint { weightKg: number | null; recordedAt: Date }
export interface WeightTrend {
  latestKg: number;
  latestDateLabel: string;          // "24/09"
  deltaKg: number | null;           // latest − anterior, redondeado a 1 decimal; null si hay una sola
  /** "Bajó 6,8 kg desde el 11/05" | "Subió 1,2 kg desde el 11/05" | "Igual que el 11/05" | null */
  text: string | null;
  /** Últimos 8 pesos, del más viejo al más nuevo (minigráfico). */
  series: number[];
}
/** null si ningún punto tiene peso. Ignora puntos sin peso. */
export function weightTrend(points: readonly WeightPoint[], tz: string): WeightTrend | null;

export type AppointmentStatusLike = "CONFIRMED" | "AWAITING_PAYMENT" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
/** "8 turnos: 6 vino, 1 canceló, 1 no vino". Orden: vino (COMPLETED), canceló, no vino (NO_SHOW),
 *  por venir (CONFIRMED/AWAITING_PAYMENT con startsAt >= now), sin marcar (CONFIRMED/AWAITING_PAYMENT
 *  pasados). Se omiten los 0. "1 turno: 1 vino". [] → "Todavía no tuvo turnos". */
export function appointmentHistoryText(appts: readonly { status: AppointmentStatusLike; startsAt: Date }[], now: Date): string;

/** Estado en palabras: Confirmado, Falta la seña, Vino, Canceló, No vino. */
export const APPOINTMENT_STATUS_TEXT: Record<AppointmentStatusLike, string>;

/** Actividad física en lenguaje común (sin factor): Sedentaria, Ligera, Moderada, Intensa, Muy intensa. */
export const ACTIVITY_PLAIN_LABELS: Record<ActivityLevel, string>;

/** "Para calcular calorías falta: sexo y actividad física"; [] → null. Usa los label de
 *  getMissingFormulaData. */
export function missingForCaloriesText(items: readonly MissingFormulaDataItem[]): string | null;

export const PATIENT_SUMMARY_TEXT = { /* textos del glosario de la HU §4.2, exactos: "Datos de la
  paciente", "Estos datos los usan las fórmulas de calorías.", "Sin cargar", "Sin medir", "Calorías
  indicadas", "Todavía no indicaste calorías. Se calculan dentro de una consulta.", "Sin turno",
  "Sin plan activo", "Ver planes", "Todavía no hay mediciones", "Cargar peso", "Abrir la consulta de
  hoy", "Nueva consulta", "Editar datos", "Datos guardados", "Ver detalle", "Ver antecedentes",
  "Completar", "WhatsApp", "Sin nombre", factor de actividad (n) => `Factor de actividad: ${n}`,
  "Mientras no la cargues, el cálculo usa contextura mediana.", "Nuevo" … */ } as const;
```

`missingFormulaDataMessage` (0.1): las frases pasan a `'La fecha de nacimiento se carga en "Editar
datos".'`, `'El peso y la talla se cargan en "Historial".'`, `'El peso se carga en "Historial".'`,
`'La talla se carga en "Historial".'`. Se actualizan `patient-formula-data.test.ts` y
`energy-requirement.test.ts:585`.

### 4.2 `apps/web/src/lib/patient-tab-route.ts` (nuevo, puro, con test)

```ts
export const PATIENT_TABS = ["resumen", "consultas", "planes", "historial"] as const;   // "planes" = etiqueta "Plan"
export type PatientTab = (typeof PATIENT_TABS)[number];
export const HISTORY_VIEWS = ["medidas", "turnos", "diario"] as const;
export type HistoryView = (typeof HISTORY_VIEWS)[number];

/** Resuelve ?tab= y ?vista= (incluidos los alias viejos):
 *  null/"resumen" → resumen; "consultas" → consultas; "planes" → planes; "historial" → historial + vista;
 *  "datos" → resumen con focus "datos"; "evolucion" → historial/medidas; "diario" → historial/diario;
 *  "turnos" → historial/turnos; valor desconocido → resumen. vista desconocida o ausente → "medidas". */
export function resolvePatientTab(tab: string | null, vista: string | null): { tab: PatientTab; view: HistoryView; focus: "datos" | null };

/** Query canónica para escribir en la URL (replaceState): resumen → sin tab; historial → tab=historial&vista=…
 *  (vista solo si no es "medidas"). */
export function patientTabQuery(tab: PatientTab, view: HistoryView): URLSearchParams;
```

`?editar=datos` abre el Sheet "Editar datos" sobre Resumen (lo usan los enlaces "Completar" de la
consulta y del estudio ISAK, que hoy apuntan a `?tab=datos`).

### 4.3 Action nueva: `updatePatientDataAction` (en `pacientes/actions.ts`)

```ts
export type PatientDataState = { ok: boolean; error?: string; fieldErrors?: Partial<Record<"name" | "birthDate" | "notes" | "background" | "goals", string>> };
/** Un solo "Guardar" para los tres grupos (D9, Q8). FormData: id, name, birthDate ("yyyy-MM-dd" o ""),
 *  notes, sex, activityLevel, nutritionGoal, bodyFrame ("" = sin cargar), background, goals, riskFlag.
 *  Valida con los mismos límites que hoy (name 120, notes 2000, background/goals 4000, enums de core) y
 *  escribe en una sola prisma.$transaction: patient.update (los 7 campos) + clinicalRecord.upsert.
 *  Revalida /pacientes/[id] ("layout") y /pacientes. */
export async function updatePatientDataAction(prev: PatientDataState, formData: FormData): Promise<PatientDataState>;
```

`updatePatientAction` y `updateClinicalRecordAction` quedan sin consumidores y se borran (con
`patient-form.tsx` y `clinical-record-form.tsx`). `updateFormulaDataAction`, `FormulaDataSheet` y
`FormulaDataForm` **se quedan**: los usan la consulta y el estudio ISAK (017c-3 decide si pasan al
Sheet nuevo).

### 4.4 Calendario (Q7)

`(calendario)/page.tsx` acepta `?fecha=yyyy-MM-dd` (validado con `isValidDayKey`) y lo pasa a
`CalendarClient` como prop **opcional** `focusDate?: string`, que llega a `initialDate` de
FullCalendar (no al `initialDate` del modal de turno nuevo). Sin `fecha`, igual que hoy. La tarjeta
"Próximo turno" enlaza a `/?fecha=<dayKey>`.

### 4.5 Mensajes del bot

Ninguno.

## 5-2. Diseño (lo esencial; el detalle visual es el de la HU §4.2)

- **`patient-tabs.tsx`**: 4 `TabsTrigger` (`grid grid-cols-4` en < 640 px para que entren a 390 px,
  sin scroll horizontal); contador de Consultas en texto secundario (sin chip); punto + `sr-only`
  "(hay entradas de las últimas 24 hs)" en Historial y en la opción "Diario". Sticky con
  `material-chrome` + `data-scrolled` (hook `useScrollEdge` de 017a). Los 4 paneles con `forceMount`
  (como hoy). `PatientTabLink` pasa a `{ tab: PatientTab; view?: HistoryView; focus?: "datos" }`.
  Al resolver `focus: "datos"`, scroll a `#datos-paciente` y foco en su título (`tabIndex={-1}`).
- **`patient-header.tsx`**: back "‹ Pacientes" (estilo `PageHeader.back`), nombre en `text-title-1`
  (sin nombre: "Sin nombre" + botón "Poner nombre", que reutiliza `name-contact-sheet.tsx` de
  017c-1), "34 años · +54 9 …" (o `HIDDEN_NUMBER_TEXT`), franja de antecedentes con "Ver
  antecedentes" (→ `focus: "datos"`), botón "WhatsApp" (`MessageCircle` + texto + `ExternalLink`,
  `sr-only` "(se abre en otra pestaña)"), oculto si `whatsappChatUrl` da null. Sale el próximo
  turno del encabezado.
- **Resumen** (`summary-section.tsx`, server): acción principal `Button size="lg"` (única variante
  `primary` del panel): si hay consulta con `dayKeyInTz(consultedAt) === todayKey` →
  `ButtonLink` "Abrir la consulta de hoy" (`pickConsultationForDay` entre las de hoy); si no,
  `NewConsultationButton` con un `trigger` `lg` "Nueva consulta" (ya abre con hoy elegido). Debajo,
  grilla `grid gap-4 sm:grid-cols-2` de 4 `SummaryCard` (Link completo + chevron + press de tarjeta):
  Próximo turno (`formatAppointmentWhen`, servicio, "Falta la seña"; sin turno: "Sin turno", sin
  enlace), Última consulta (`capitalizeFirst(formatTimeAgo)` + " · " + `formatShortDate` y
  `recordedItemsText(…, "short")`), Plan (activo más reciente por `updatedAt`: "Plan otoño · desde el
  24/09" con la fecha de la primera consulta que lo indicó o su `createdAt`; sin plan: "Sin plan
  activo" + "Ver planes" → pestaña Plan), Peso (`Metric size="lg"` con
  `trend.sentiment="neutral"` y `label` = `weightTrend.text`, más `weight-sparkline.tsx`; sin
  mediciones: "Todavía no hay mediciones" + "Cargar peso" → Historial › medidas). A ≥ 1366 px, los
  datos al costado (`xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`) si entra.
- **Datos de la paciente** (`patient-data-section.tsx`, `id="datos-paciente"`): `GroupedList` con
  Edad, Sexo, Objetivo, Actividad física (`ACTIVITY_PLAIN_LABELS`), Contextura, Calorías indicadas
  ("1.698 kcal por día · 24/09" o el texto de vacío), Antecedentes ("Hipotiroidismo (riesgo)") y
  Objetivos clínicos. Lo que falta: "Sin cargar" en `text-muted-foreground`, sin `Badge`. Aviso
  amarillo `missingForCaloriesText` con "Completar" (abre el Sheet; si solo faltan peso/talla,
  "Cargar peso" → Historial). Avisos pediátricos (`PEDIATRIC_TEXT`) sin cambios. "Ver detalle" =
  disclosure con: factor de actividad, contextura sin cargar = mediana, peso/talla/grasa con fecha
  (la grasa sin dato dice "Sin medir"), proteínas/grasas/carbohidratos de la última prescripción y
  qué fórmulas usan cada dato. Botón "Editar datos" (`Pencil` + texto, `secondary`).
- **`edit-patient-sheet.tsx`**: Sheet derecho (abajo en < 640 px) con tres grupos (Personales: nombre,
  fecha de nacimiento, notas; Para calcular calorías: sexo, actividad, objetivo, contextura; Ficha
  clínica: antecedentes, objetivos, "Antecedentes de riesgo"), un "Guardar" (`lg`) →
  `updatePatientDataAction`; éxito: cerrar + `notify.saved("Datos guardados")`; errores por campo
  inline.
- **Historial** (`history-section.tsx`, cliente): `SegmentedControl size="md" fullWidth` en < 640 px;
  los tres paneles montados (`hidden` en los inactivos). Peso y medidas = `EvolutionSection` actual
  (formulario + gráficos + tabla). Turnos = `appointmentHistoryText` arriba + lista (en < 768 px una
  `GroupedList`; en escritorio la tabla actual) con fecha en lenguaje común, servicio, motivo, estado
  con ícono + `APPOINTMENT_STATUS_TEXT` y "Ver consulta". Diario = `DiarySection` con "Nuevo" en las
  de < 24 h. Los `StatTile` de turnos salen del Resumen.
- **Consultas** (`consultations-section.tsx`): `NewConsultationButton` arriba (ícono + texto) y una
  `GroupedList` con `label` = `formatConsultationDay`, `description` = "Con turno (Control) · 10:00" o
  "Sin turno" + " · " + `recordedItemsText(…, "sentence")`.
- **Plan** (`plans-section.tsx`, solo visual): la lista como `GroupedList` (título, estado con ícono +
  texto Activo/Borrador/Archivado, "actualizado el …", `consultationLabel`), y `SegmentedControl` en
  lugar del `ToggleGroup`. **Sin cambiar** imports ni usos de `createPlanAction`/`applyTemplateAction`,
  los `useActionState`, los `name=` de los inputs ni los `<form action>`.
- Se borran: `evolution-summary.tsx` (lo reemplaza la tarjeta Peso), `formula-data-section.tsx`,
  `requirement-summary-card.tsx`, `patient-form.tsx`, `clinical-record-form.tsx`. `ClinicalAlert`
  completo se reutiliza dentro de "Datos de la paciente"; su versión `compact` queda en el
  encabezado con "Ver antecedentes".
- Enlaces internos: `consultation-actions.ts` y `consultas/[cid]/page.tsx` siguen con
  `?tab=consultas`; `requirement-section.tsx` y `antropometria/page.tsx` pasan de `?tab=datos` a
  `?editar=datos`; `planes/[planId]/page.tsx` (`?tab=planes`) **no se toca** y funciona porque el
  valor se mantiene.

## 6-2. Pantallas (skill `ui`)

| Vista | Estructura base | Componentes clave |
|---|---|---|
| Ficha › Resumen | Encabezado sticky translúcido (back, nombre, datos, antecedentes, WhatsApp) + 4 pestañas; cuerpo: acción principal, grilla de 4 tarjetas, "Datos de la paciente". | `Tabs`, `Button lg` (única primaria), `SummaryCard`, `Metric` + sparkline SVG, `GroupedList`, `Alert warning`, disclosure "Ver detalle". |
| Sheet "Editar datos" | Lateral derecho / desde abajo. | `Sheet`, `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, `Button lg`, toast. |
| Ficha › Consultas | Encabezado + lista. | `GroupedList`, `NewConsultationButton`, `EmptyState`. |
| Ficha › Plan | Encabezado + lista de planes + tarjeta "Nuevo plan". | `GroupedList`, `SegmentedControl`, formularios actuales. |
| Ficha › Historial | Encabezado + segmentado + 3 paneles montados. | `SegmentedControl`, `EvolutionSection`, lista de turnos, `DiarySection`. |

## 7-2. Archivos

`packages/core/src/patient-summary.ts` (+test), `packages/core/src/index.ts`,
`packages/core/src/patient-formula-data.ts` (+tests de 0.1); `apps/web/src/lib/patient-tab-route.ts`
(+test); en `pacientes/[id]/`: `page.tsx`, `patient-tabs.tsx`, `patient-header.tsx`,
`clinical-alert.tsx`, `consultations-section.tsx`, `appointments-section.tsx`, `diary-section.tsx`,
`plans-section.tsx` (visual), `evolution-section.tsx` (si hace falta para montarlo en Historial),
nuevos `summary-section.tsx`, `summary-card.tsx`, `weight-sparkline.tsx`,
`patient-data-section.tsx`, `edit-patient-sheet.tsx`, `history-section.tsx`; borrados de 5-2;
`pacientes/actions.ts` (+test); `pacientes/[id]/clinical-actions.ts` (borrar
`updateClinicalRecordAction`); `consultas/[cid]/requirement-section.tsx` y
`antropometria/page.tsx` (solo el `href`); `pacientes/[id]/loading.tsx`; `(calendario)/page.tsx` y
`calendar-client.tsx` (prop opcional, Q7).

## 8-2. Checklist (un commit por fase)

- **Fase A (core):** `patient-summary.ts` + tests; `missingFormulaDataMessage` + tests; `index.ts`.
  `typecheck` core y bot. Commit `HU-017c-2: resumen del paciente en lenguaje común (core)`.
- **Fase B (ruteo y action):** `patient-tab-route.ts` + test; `updatePatientDataAction` + test (una
  sola `$transaction`, solo los campos listados). Commit `HU-017c-2: alias de pestañas y "Editar datos" (action)`.
- **Fase C (pestañas y encabezado):** `patient-tabs.tsx` (4 pestañas, alias, sticky translúcido),
  `patient-header.tsx`, `PatientTabLink` nuevo y sus usos; los paneles viejos montados
  provisoriamente dentro de los nuevos para no romper. Commit `HU-017c-2: ficha de 4 pestañas con alias de URL`.
- **Fase D (Resumen):** tarjetas, acción principal, "Datos de la paciente", "Ver detalle",
  `edit-patient-sheet.tsx`, `?editar=datos`, deep link del calendario; borrar los componentes de 5-2.
  Commit `HU-017c-2: Resumen con una acción principal y datos en lenguaje común`.
- **Fase E (Historial, Consultas, Plan):** `history-section.tsx`, turnos en palabras, diario,
  consultas en lenguaje común, `plans-section.tsx` visual. Commit `HU-017c-2: Historial, Consultas y Plan`.
- **Fase F (cierre):** `loading.tsx`, verificación 10-2, `progress/impl_HU-017c-2.md`. Commit.

## 9-2. Tests

- `patient-summary.test.ts`: `formatConsultationDay` (mismo año / otro año); `consultationRecordedItems`
  (solo peso → `["peso"]`; peso + cintura → `["peso","medidas"]`; bioimpedancia; notas con espacios no
  cuentan; orden fijo); `recordedItemsText` (0, 1, 2 y 3 ítems, ambas formas); `weightTrend` con
  67,8 (11/05) y 61 (24/09) → `deltaKg −6.8`, `"Bajó 6,8 kg desde el 11/05"`; subida; igual; un solo
  punto → `text: null`; 10 puntos → `series` de 8 en orden cronológico; sin pesos → `null`;
  `appointmentHistoryText` (6 COMPLETED + 1 CANCELLED + 1 NO_SHOW → `"8 turnos: 6 vino, 1 canceló, 1 no vino"`;
  uno → singular; futuros "por venir"; pasados sin marcar; vacío); `missingForCaloriesText`
  (sexo + actividad → `"Para calcular calorías falta: sexo y actividad física"`; 3 ítems con coma; vacío → null).
- `patient-tab-route.test.ts`: la tabla completa de alias de la HU §2.2 (7 valores viejos + los 4
  nuevos + desconocido + `vista` desconocida); `patientTabQuery` (resumen sin `tab`; historial/turnos
  → `tab=historial&vista=turnos`; historial/medidas sin `vista`).
- `pacientes/actions.test.ts` (suma): `updatePatientDataAction` llama a `$transaction` con un
  `patient.update` de exactamente `name, birthDate, notes, sex, activityLevel, nutritionGoal,
  bodyFrame` y un `clinicalRecord.upsert`; `""` → `null`; enum inválido → error sin escribir; name de
  121 → `fieldErrors.name`.
- Tests existentes de `patient-formula-data` y `energy-requirement` actualizados al texto nuevo.

## 10-2. Verificación

Los comandos de 10.1 y 10.2 de 017c-1, más:

```bash
git diff origin/develop -- 'apps/web/src/app/(panel)/pacientes/[id]/plans-section.tsx' | grep -E '^[-+].*(createPlanAction|applyTemplateAction|useActionState|name="|action=\{)'   # → solo líneas movidas sin cambio de contenido (revisar a mano)
git diff origin/develop --name-only | grep -E 'pacientes/\[id\]/planes/'                                   # → vacío
```

Recorrido (orquestador, 1366/768/390, solo lectura sobre datos reales): la tabla de alias completa
abriendo cada `?tab=` viejo a mano; "Volver a <paciente>" desde un plan real (sin editar) cae en
"Plan"; escribir en el formulario de nueva medición, cambiar a Consultas y volver → sigue escrito (no
guardar); "Ver detalle"; abrir "Editar datos" y cancelar en una paciente real; guardar solo en una
paciente de prueba creada por id (como en 10.3 de 017c-1); las 4 pestañas entran a 390 px; encabezado
translúcido al scrollear; movimiento reducido. **Las tres tareas de D1 otra vez**, comparadas con la
línea de base de 017c-1, en `progress/recorrido_HU-017c-2.md`.

---

# Entrega 017c-3: consulta, ISAK y borrados con "Deshacer"

## 1-3. Resumen funcional

En la consulta, el estudio ISAK, Historial y la ficha: las acciones destructivas pasan al menú
"Más opciones" (`…`); cada borrado pide confirmación en palabras simples (foco en "Cancelar") y
muestra un toast con **"Deshacer" durante 8 s** con **borrado diferido en el cliente** (D12a). "Quitar
plan" se aplica al toque y se deshace volviendo a poner el plan. Botones con ícono y texto (44 px las
acciones principales), columna lateral sticky desde 1280 px si entra en la altura, un solo aviso en
palabras simples, ISAK con índice de secciones, títulos `text-headline`, barras z con color suave y
etiquetas "bajo"/"alto", formulario ISAK con grupos e inputs de 44 px, gráficos desde tokens.

## 2-3. Workspaces afectados

`packages/core` **sí** (textos de 0.1 en `isak-study.ts` y `energy-requirement.ts`, con sus tests);
`packages/db` **no**; `apps/web` **sí**; `apps/bot` **no**.

## 3-3. Esquema

**No cambia.** El borrado diferido no necesita columnas (a diferencia de un borrado lógico, D12c).

## 4-3. Contrato: el mecanismo de "Deshacer" (D12a)

### 4.1 `apps/web/src/lib/deferred-delete.ts` (nuevo)

Dos capas: un **store puro** testeable en node y un adaptador de React.

```ts
export type CommitResult = { ok: boolean; error?: string };

export interface DeferredDeleteStore {
  /** Oculta `key` al instante y deja el borrado pendiente. Devuelve el id de la entrada. */
  schedule(entry: { key: string; commit: () => Promise<CommitResult> }): string;
  /** Deshace: saca `key` de los pendientes sin llamar a commit. true si llegó a tiempo. */
  undo(id: string): boolean;
  /** Ejecuta commit (una sola vez por entrada). Si falla, vuelve a mostrar `key` y devuelve el error. */
  commit(id: string): Promise<CommitResult>;
  isPending(key: string): boolean;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ReadonlySet<string>;
}
/** Cada entrada se resuelve UNA vez (lo primero entre undo y commit gana; el resto es no-op). */
export function createDeferredDeleteStore(): DeferredDeleteStore;

/** Store único del panel (módulo cliente). */
export const deferredDeletes: DeferredDeleteStore;

/** Hook: ¿esta key está pendiente de borrado? (useSyncExternalStore). */
export function usePendingDeletion(key: string): boolean;
/** Hook: todas las keys pendientes (para filtrar listas). */
export function usePendingDeletions(): ReadonlySet<string>;

/** Orquesta confirmación ya hecha → schedule → toast:
 *  notify.undo(message, onUndo, { onExpire }) donde onExpire = commit (vencen los 8 s o se cierra el
 *  toast). onUndo → undo + notify.saved(undoneMessage) (+ acción opcional "Abrir").
 *  Si commit falla → notify.error("No se pudo borrar. Probá de nuevo.") y el dato vuelve a verse.
 *  Si commit sale bien → router.refresh(). */
export function useDeferredDelete(): (opts: {
  key: string;                       // p. ej. `isak:${entryId}`, `consultation:${id}`, `measurement:${id}`, `prescription:${consultationId}`
  message: string;                   // "Estudio borrado"
  undoneMessage: string;             // "Listo, el estudio volvió"
  commit: () => Promise<CommitResult>;
  afterSchedule?: () => void;        // p. ej. navegar a la ficha al borrar la consulta
  undoneAction?: { label: string; href: string };   // "Abrir" la consulta restaurada
}) => void;
```

Reglas:
- **Keys:** `consultation:<id>`, `isak:<entryId>`, `prescription:<consultationId>`,
  `measurement:<entryId>`. Cada componente que muestra uno de esos datos se oculta (o se filtra de su
  lista) con `usePendingDeletion`/`usePendingDeletions`: `IsakCard`, `RequirementSection`, filas de
  `ConsultationMeasurements`, filas de `EvolutionTable`, filas de `ConsultationsSection`.
- **Si se cierra la pestaña o se recarga antes de los 8 s, no se borra** (falla del lado seguro, D12a).
  Navegar dentro del panel no corta el plazo: el `<Toaster />` vive en el layout y el tiempo sigue
  (Q10). Con el mouse sobre el toast el tiempo se pausa (sonner).
- No hay timer de respaldo propio: si el toast vence o se cierra, `onAutoClose`/`onDismiss` llaman a
  commit; el clic en "Deshacer" no dispara ninguno de los dos (verificado en `sonner@2.0.8`), y el
  store ignora una segunda resolución igual.

### 4.2 `lib/notify.ts`

`notify.undo(message, onUndo, options?: { onExpire?: () => void })`: tercer parámetro **opcional**;
si viene, se pasa como `onAutoClose` y `onDismiss` del toast. Los usos de hoy (recetario y menú
semanal) no cambian.

### 4.3 Actions que cambian (sin redirect, con resultado)

| Action | Cambio |
|---|---|
| `deleteConsultationAction(patientId, consultationId)` | **Sin `redirect()`**: devuelve `{ ok: true }`. La navegación a `?tab=consultas` la hace el cliente al programar el borrado. Único consumidor: el botón de borrar consulta. |
| `deleteEvolutionEntryAction(formData): void` | Se reemplaza por `deleteEvolutionEntryByIdAction(patientId: string, entryId: string): Promise<ActionState>` (misma validación de pertenencia; `{ ok: false, error: "No se pudo borrar la medición." }` si falla). Único consumidor: `evolution-table.tsx`. |
| `deleteIsakStudyAction`, `deletePrescriptionAction`, `deleteConsultationMeasurementAction` | Sin cambios de firma (ya devuelven `ActionState`). |
| `clearConsultationPlanAction` / `setConsultationPlanAction` | Sin cambios. "Deshacer" de "Quitar plan" llama a `setConsultationPlanAction` con un `FormData` armado con el plan anterior (`patientId`, `consultationId`, `planId`). Si falla: `notify.error("No se pudo deshacer.")`. |

### 4.4 Textos (0.1 y HU §4.3)

Confirmaciones exactas de la tabla de la HU §4.3 (título, texto, botón). Toasts: "Consulta borrada",
"Estudio borrado", "Cálculo borrado", "Medición borrada", "Plan quitado de la consulta"; al deshacer
"Listo, la consulta volvió" (con acción "Abrir"), "Listo, el estudio volvió", "Listo, el cálculo
volvió", "Listo, la medición volvió", "Listo, el plan volvió". Los que viven en core
(`ISAK_TEXT.delete*`, `REQUIREMENT_TEXT.deleteConfirm*`/`deleted`) se cambian ahí con sus tests (son
solo del panel); el resto en una constante nueva `UNDO_TEXT` en `deferred-delete.ts` o en core
(`patient-summary.ts`), a elección del implementer, con test.

### 4.5 Mensajes del bot

Ninguno.

## 5-3. Diseño

- Componente `MoreActionsMenu` (`components/more-actions-menu.tsx`): `DropdownMenu` con trigger
  `Button variant="ghost" size="icon-lg"` (44 px), ícono `Ellipsis`, `aria-label="Más opciones"` y
  `Tooltip` "Más opciones"; ítems `DropdownMenuItem variant="destructive"` con ícono + texto; un ítem
  puede ir `disabled` con su motivo debajo (`aria-describedby`), p. ej. "Borrar consulta" con
  `CONSULTATION_TEXT.notDeletable`.
- Consulta: encabezado "Consulta del miércoles 24/09" (día de la semana en minúscula, en medio de la
  frase), "Con turno · Control · 10:00" o "Sin turno"; acciones "Cambiar fecha" (si no tiene turno) y
  `MoreActionsMenu` (Borrar consulta). Se va el `Separator` + botón del pie. Columna principal:
  Mediciones · Estudio ISAK · Diagnóstico · "Calorías y nutrientes". Lateral (`xl:` ≥ 1280 px):
  Plan indicado · Motivo de la reserva · Notas, `sticky top-[var(--chrome-h)]` **solo si** su alto
  entra en la ventana (medido con `ResizeObserver` + `innerHeight`; si no, estático). "Guardado a las
  10:42" bajo el botón de notas.
- Un solo aviso amarillo cuando el turno no está completado: `CONSULTATION_TEXT.appointmentNotCompleted`
  queda (es exacto de HU-003) dentro de un `Alert` con la acción "Abrir el turno" →
  `/?fecha=<dayKey>`.
- Tarjeta ISAK: "Ver estudio completo" (`primary`, `lg`), "Informe" (`FileText`) y "Editar"
  (`Pencil`) `secondary`, `MoreActionsMenu` → Borrar estudio. Calorías: "Editar cálculo" +
  menú → Borrar cálculo. Mediciones: cada fila con menú → Borrar medición. Plan indicado: "Ver plan"
  + menú → Quitar plan de esta consulta (sin confirmación).
- Página ISAK: índice de secciones sticky (chips en < 1280 px, lista lateral desde `xl`) con
  `IntersectionObserver` para marcar la activa y `scroll-margin-top` en cada sección; títulos
  `text-headline`; encabezado "Informe" (`primary`), "Editar", menú → Borrar estudio (al borrar:
  `afterSchedule` navega a la consulta). Barras z: fondo `bg-secondary`, relleno con el color
  semántico suave del token (tint según zona), etiquetas "bajo" y "alto" en los extremos, valor en
  texto (no depende del color). Gráficos con colores de `chartPalette` y entrada ≤ 400 ms
  desactivada con movimiento reducido.
- Formulario ISAK: `fieldset` + `legend` por grupo (Básicas, Pliegues, Perímetros, Diámetros,
  Longitudes, según los campos de `isak-form.ts`), `NumberInput`/`Input` de `h-11` con
  `inputMode="decimal"`, unidad visible a la derecha, texto ≥ 16 px. Toast "Estudio guardado".
- Todos los botones de acción con ícono + texto; solo cerrar y "…" son de ícono, con nombre accesible
  y tooltip.

## 6-3. Pantallas (skill `ui`)

| Vista | Estructura base | Componentes clave |
|---|---|---|
| Consulta (≥ 1280 px) | Encabezado + 2 columnas, lateral sticky condicional. | `PageHeader`, `MoreActionsMenu`, `Alert`, `Card`, `AlertDialog` (useConfirm), toast con "Deshacer". |
| Consulta (390 px) | Una columna; lateral debajo. | Igual, botones a lo ancho. |
| Estudio ISAK | Encabezado + índice sticky + secciones. | Chips/lista de índice, `Card` por sección, barras z, somatocarta. |
| Formulario ISAK | Dentro de la tarjeta ISAK. | `fieldset`, inputs numéricos de 44 px, `Button lg`. |
| Historial › Peso y medidas | Tabla de mediciones. | Fila con `MoreActionsMenu` → Borrar medición. |

## 7-3. Archivos

`lib/deferred-delete.ts` (+test), `lib/notify.ts`, `components/more-actions-menu.tsx`;
`consultas/[cid]/page.tsx`, `delete-consultation-button.tsx` (pasa a ítem de menú),
`delete-isak-study-button.tsx` (ídem), `isak-card.tsx`, `isak-form.tsx`, `requirement-section.tsx`,
`consultation-measurements.tsx`, `consultation-plan.tsx`, `consultation-notes.tsx`,
`antropometria/page.tsx`, `z-score-bar.tsx`, `somatochart.tsx`, `tissue-stacked-bar.tsx`;
`pacientes/[id]/evolution-table.tsx`, `consultations-section.tsx`, `consultation-actions.ts`,
`clinical-actions.ts`; core `isak-study.ts`, `energy-requirement.ts` y sus tests.

## 8-3. Checklist (un commit por fase)

- **Fase A:** `deferred-delete.ts` (store + hooks) + test; `notify.undo` con `onExpire`. Commit
  `HU-017c-3: borrado diferido con Deshacer (mecanismo)`.
- **Fase B:** actions sin redirect / con resultado (4.3) + tests con mocks; textos de core (0.1).
  Commit `HU-017c-3: actions de borrado listas para diferir`.
- **Fase C:** `MoreActionsMenu`; consulta (encabezado, menú, lateral sticky, aviso, notas). Commit.
- **Fase D:** los 5 borrados con confirmación + "Deshacer" (consulta, estudio, cálculo, medición en
  consulta y en Historial, quitar plan) y el filtrado de pendientes en cada lista. Commit.
- **Fase E:** página ISAK (índice, títulos, barras z, gráficos) y formulario ISAK. Commit.
- **Fase F:** verificación 10-3 y `progress/impl_HU-017c-3.md`. Commit.

## 9-3. Tests

- `deferred-delete.test.ts` (store puro, sin DOM): `schedule` oculta la key; `undo` antes de
  `commit` → no llama a `commit` y la key vuelve; `commit` llama una sola vez aunque se invoque dos;
  `undo` después de `commit` → `false` y no restaura; `commit` que devuelve `{ ok: false }` → la key
  vuelve y se devuelve el error; `commit` que tira → igual que `{ ok: false }`; dos entradas con keys
  distintas no se pisan; `subscribe` avisa en cada cambio.
- `consultation-actions` (mocks): `deleteConsultationAction` exitosa **no** llama a `redirect` y
  devuelve `{ ok: true }`; no borrable → `CONSULTATION_TEXT.notDeletable`.
- `clinical-actions` (mocks): `deleteEvolutionEntryByIdAction` con una medición de otro paciente →
  error, sin borrar.
- Tests de core actualizados a los textos nuevos de 0.1.

## 10-3. Verificación

Comandos de 10.1/10.2 de 017c-1. Recorrido (orquestador): **solo con datos de prueba creados por
id** (paciente "Prueba 017c-3", consulta sin turno, una medición, un estudio ISAK con informe
generado sin enviar, un cálculo, un plan indicado). Para cada borrado: confirmación con el foco en
"Cancelar"; toast 8 s; "Deshacer" → vuelve igual (el estudio con sus medidas y su informe); dejar
vencer → se borra (verificar con `select` por id); cerrar el toast con la X → se borra; recargar la
página antes de los 8 s → **no** se borra; navegar a otra pantalla del panel → se borra a los 8 s.
Forzar un fallo (DevTools → Network offline antes de que venza) → "No se pudo borrar. Probá de
nuevo." y el dato vuelve. Teclado: Tab hasta "…", abrir con Enter, elegir con flechas, confirmar o
cancelar; el botón "Deshacer" del toast se alcanza con Tab y se anuncia. Lateral sticky a 1366×768 y
a 1920×1080. Movimiento reducido. Al terminar, borrar por id lo que quede de la prueba.

---

# Entrega 017c-4: informe antropométrico y su PDF

## 1-4. Resumen funcional

En el editor del informe: la instrucción "Revisá los textos antes de generar el PDF." pasa a texto de
ayuda bajo el título; los problemas reales se juntan en un solo bloque "Antes de enviar" (una fila por
problema con su botón); el aviso de menor de edad queda aparte como info; los campos editados muestran
"Editado" + "Restaurar el texto original"; "Generar PDF" es la acción principal; "Enviar por WhatsApp"
pide confirmación con el nombre y el teléfono con formato. El PDF del informe usa una **paleta propia**
de grises fríos y una escala tipográfica Inter adaptada a puntos, con el acento de Ajustes (o
`#1D1D1F` si no hay); el PDF del plan no cambia.

## 2-4. Workspaces afectados

`apps/web` **sí**; `packages/core` **no** (`ISAK_REPORT_TEXT` no cambia: sale en el PDF y en el
caption de WhatsApp, D11b; los textos nuevos del editor van en la UI); `packages/db` **no**;
`apps/bot` **no**.

## 3-4. Esquema

**No cambia.**

## 4-4. Contrato

### 4.1 `apps/web/src/lib/report-pdf-theme.ts` (nuevo)

```ts
/** Acento del informe si la profesional no eligió color (D15). */
export const REPORT_DEFAULT_ACCENT = "#1D1D1F";
export const reportPdfColors = { text: "#1D1D1F", muted: "#636366", border: "#E5E5EA", subtle: "#F5F5F7" } as const;
/** Escala en pt (madre §5.3 adaptada; sin opsz: los .woff de public/fonts no lo traen):
 *  title 20/600, heading 13/600, body 10/400, caption 8.5/400, metric 16/600. */
export const reportPdfType: { title: …; heading: …; body: …; caption: …; metric: … };
/** Tejidos, serie anterior y zonas de la silueta: mismas luminancias relativas que hoy (se distinguen
 *  impresos en gris), con tonos fríos. Test de luminancia en el .test.ts. */
export const reportPdfTissueColors, reportPdfTissueTextColors, reportPdfPreviousColor, reportPdfZoneColors;
```

### 4.2 `lib/pdf-common.tsx` (compartido con el PDF del plan)

`buildCommonStyles(accentColor, palette = pdfColors)` y, en `PdfHeader`, `PdfFooter` y
`PdfSignatureBlock`, una prop **opcional** `palette` con default `pdfColors`. Sin `palette`, el
resultado es idéntico al de hoy (el plan no la pasa). `pdf-theme.ts` **no cambia** (`pdfColors`,
`DEFAULT_PDF_ACCENT` y los `report*` se quedan para no romper importaciones hasta 017e).

### 4.3 `anthropometric-report-pdf.tsx` y `report-pdf-charts.tsx`

Pasan a `report-pdf-theme.ts` y a `palette={reportPdfColors}`. El acento: el elegido en Ajustes o
`REPORT_DEFAULT_ACCENT`.

### 4.4 Editor (`report-editor.tsx`)

- Bloque "Antes de enviar" (`Alert tone="warning" title="Antes de enviar"`) con una fila por problema:
  "El estudio cambió después del último PDF" → "Generar de nuevo"; "Faltan medidas en el estudio: el
  PDF va a decir «Sin dato»" → "Completar estudio"; "Falta tu matrícula o tu firma" → "Ir a Ajustes"
  (`/ajustes?tab=pdf`). Solo se muestra si hay al menos un problema.
- Marca "Editado" (`Badge` neutral o texto `text-footnote`) cuando `texts[k] !== default[k]`, al
  lado de "Restaurar el texto original".
- Acciones: "Generar PDF" `primary lg`; "Guardar" y "Descargar" `secondary`; "Enviar por WhatsApp"
  `secondary` que abre `useConfirm` con título `¿Enviar el informe a ${nombre}?`, texto `Le llega por
  WhatsApp al ${formatPhone(phone)}.` (para `hidden`: "Le llega por WhatsApp.") y botón "Enviar"
  (`destructive: false`). En < 640 px, barra de acciones sticky abajo (`material-bar`).
- `informe/page.tsx` le pasa `whatsappJid` y `phone` del paciente.

### 4.5 Mensajes del bot

No cambian. El caption de WhatsApp sigue siendo `ISAK_REPORT_TEXT.whatsappCaption`.

## 6-4. Pantallas (skill `ui`)

| Vista | Estructura base | Componentes clave |
|---|---|---|
| Informe (escritorio) | Encabezado con ayuda + bloque "Antes de enviar" + textos editables + barra de acciones. | `PageHeader`, `Alert warning` con filas, `Textarea` + "Editado" + "Restaurar…", `Button lg`, `AlertDialog`. |
| Informe (390 px) | Igual en una columna; acciones sticky abajo. | `material-bar`. |
| PDF del informe | Página A4. | Paleta fría, escala en pt, acento de Ajustes. |

## 7-4. Archivos

`lib/report-pdf-theme.ts` (+test), `lib/pdf-common.tsx` (prop opcional), `lib/anthropometric-report-pdf.tsx`,
`lib/report-pdf-charts.tsx`, `lib/anthropometric-report-pdf.test.tsx`,
`antropometria/informe/report-editor.tsx`, `antropometria/informe/page.tsx`. **No** se tocan
`lib/plan-pdf.tsx`, `lib/pdf-theme.ts` ni `ajustes/**`.

## 8-4. Checklist (un commit por fase)

- **Fase A:** `report-pdf-theme.ts` + test; `pdf-common.tsx` con `palette` opcional; `plan-pdf.test.tsx`
  sigue verde **sin cambiar** sus aserciones. Commit `HU-017c-4: paleta propia del PDF del informe`.
- **Fase B:** `anthropometric-report-pdf.tsx` y `report-pdf-charts.tsx` con la paleta y la escala;
  `anthropometric-report-pdf.test.tsx` actualizado (colores nuevos, firma igual). Commit.
- **Fase C:** editor (ayuda, "Antes de enviar", "Editado", jerarquía, confirmación de envío). Commit.
- **Fase D:** verificación 10-4 y `progress/impl_HU-017c-4.md`. Commit.

## 9-4. Tests

- `report-pdf-theme.test.ts`: `contrastRatio(text, "#FFFFFF") ≥ 7`, `muted ≥ 4,5`; las 4 luminancias
  de tejidos distintas entre sí por ≥ 0,08 (se distinguen en gris), igual para las 3 zonas.
- `anthropometric-report-pdf.test.tsx`: el PDF se genera; usa `reportPdfColors.text` y no
  `pdfColors.text`; sin acento usa `REPORT_DEFAULT_ACCENT`.
- `plan-pdf.test.tsx`: sin cambios y en verde (prueba de que el plan no cambió).
- Unidad pura para "Editado" si se extrae a una función (`isEditedText(current, defaultText)`).

## 10-4. Verificación

Comandos de 10.1/10.2 de 017c-1, más `git diff origin/develop --name-only | grep -E 'lib/(plan-pdf|pdf-theme)\.tsx?$|ajustes/'`
→ vacío. Recorrido: con un estudio ISAK de **prueba** (paciente creado por id): generar el PDF,
descargarlo, revisar paleta y tipografía, imprimirlo a PDF en escala de grises y comparar tejidos y
zonas; generar el PDF de un plan **de prueba** antes y después (mismo aspecto); abrir "Enviar por
WhatsApp" y **cancelar** (nunca confirmar, T8). Si por error se encola algo, borrar la fila de
`OutboundMessage` por id antes de que el bot la despache.

---

## 11. Riesgos y rollback

| # | Riesgo | Mitigación |
|---|---|---|
| R-1 | Un `?tab=` viejo deja de funcionar (sobre todo `?tab=planes` desde la zona de imleticio). | `resolvePatientTab` con test de la tabla completa; recorrido de 017c-2 abre cada alias. |
| R-2 | El borrado diferido deja datos "fantasma" visibles en otra pantalla durante ≤ 8 s. | Cada lista que muestra un dato borrable filtra por `usePendingDeletions`; el commit hace `router.refresh()`. |
| R-3 | El borrado diferido no se ejecuta (pestaña cerrada) y la usuaria cree que se borró. | Es la falla del lado seguro elegida en D12a; el dato reaparece al volver. |
| R-4 | "Poner nombre" o "Editar datos" pisan campos que no muestran. | Action de un solo campo (017c-1) y `$transaction` con la lista exacta de campos (017c-2), con tests que fijan la `data`. |
| R-5 | El PDF del plan cambia sin querer por `pdf-common.tsx`. | `palette` opcional con default `pdfColors`; `plan-pdf.test.tsx` sin cambios; recorrido antes/después. |
| R-6 | `ConversationState.updatedAt` no es exactamente "el último mensaje" (Q1). | Aceptado; el texto es aproximado y solo se usa cuando no hay consulta. |
| R-7 | Turbopack rechaza exports no async en `"use server"`. | `next build --turbopack` en cada entrega (10.1). |

**Rollback:** sin datos ni migraciones. Cada entrega es un PR; cada fase, un commit revertible.
Revertir 017c-1 vuelve la tabla de pacientes; los helpers de core quedan sin uso y no molestan.

---

## 12. Dudas técnicas (cada una con recomendación; ninguna bloquea 017c-1)

| # | Duda | Recomendación (default del implementer) |
|---|---|---|
| Q1 | No hay tabla de mensajes entrantes. "Escribió hace…" (Por completar) y "Te escribió hace…" (D5) solo pueden salir de `ConversationState.updatedAt`, que también cambia cuando el bot manda un pedido de confirmación (`reminders.ts`) o limpia una sesión vencida (`botAi.ts`). | Usarlo igual, con `Patient.createdAt` de respaldo en "Por completar". Para los contactos sin nombre es casi siempre el último mensaje (no tienen turnos). En la lista principal solo aparece si no hay consulta. Si se quiere exacto, hace falta guardar el último mensaje entrante (esquema, HU aparte). |
| Q2 | `@lid` **con nombre** en la lista principal: ¿se agrega "WhatsApp no muestra el número" a la segunda línea? | **No.** La fila ya tiene nombre y próximo turno; el texto largo la ensucia. Se muestra en la ficha y en "Por completar", donde el número sería el dato principal. |
| Q3 | Atajo `/` para el buscador (la HU lo deja opcional). | **Sí**, con las exclusiones de 5.2. Cuesta poco y no molesta en táctil. |
| Q4 | Enter en el buscador. | Abre la ficha de la primera coincidencia con nombre. Sirve para la tarea T1 de D1. |
| Q5 | ¿Una fila de "Por completar" lleva a la ficha? | **Sí** (zona izquierda como enlace, "Poner nombre" aparte). Hoy esos contactos son accesibles y algunos pueden tener turnos o consultas. |
| Q6 | Ramas de las entregas. | 017c-1 en `feat/hu-017c-pacientes`. Las siguientes, cada una desde `develop` actualizado **después** del merge de la anterior: `feat/hu-017c2-ficha`, `feat/hu-017c3-consulta`, `feat/hu-017c4-informe`. Es lo que se hizo en 018c/018c-2 y evita encadenar ramas. |
| Q7 | La tarjeta "Próximo turno" debería abrir el calendario en ese día, pero el calendario no acepta fecha por URL. Es zona de 017b (de senkuch4n, sin arrancar). | Agregar en 017c-2 `?fecha=` con una prop **opcional** de `CalendarClient` (4.4 de 017c-2). Si 017b arranca antes, se coordina ahí; si no se quiere tocar el calendario, la tarjeta enlaza a `/` sin fecha. |
| Q8 | "Editar datos" con un "Guardar": ¿una action nueva o las tres de hoy en secuencia? | **Una action nueva con `$transaction`** (4.3 de 017c-2): un solo resultado, sin estados a medias si falla la segunda. Las tres de hoy, en secuencia desde el cliente, podrían guardar la mitad. `updateFormulaDataAction` se queda para la consulta. |
| Q9 | Minigráfico de peso. | SVG propio (polyline de las últimas 8 mediciones, server component, `aria-hidden` con el dato en texto al lado). Recharts es pesado para 60×24 px. |
| Q10 | Borrado diferido y navegación: ¿commit inmediato al cambiar de ruta, o esperar los 8 s? | **Esperar** (el toast vive en el layout y sigue). Un commit inmediato le quitaría el "Deshacer" a quien borra la consulta, que justamente navega a la ficha. Las listas filtran los pendientes. |
| Q11 | "Borrar consulta" cuando no se puede (tiene mediciones, cálculo o plan). | Ítem del menú `disabled` con `CONSULTATION_TEXT.notDeletable` como descripción (no se esconde: explica qué hacer). |
| Q12 | Textos de borrado de core que dicen "No se puede deshacer." | Cambiarlos en core (0.1): son solo del panel y con "Deshacer" quedan falsos. |
| Q13 | `pdf-common.tsx` es compartido con el PDF del plan (017e). | Prop/parámetro `palette` opcional con default `pdfColors` (4.2 de 017c-4). |
| Q14 | Escala Inter del PDF sin `opsz` (los `.woff` no lo traen). | Usar los pesos estáticos 400/500/600 y la escala de 4.1 de 017c-4 en pt. No agregar fuentes nuevas. |
| Q15 | `missingFormulaDataMessage` nombra pestañas que desaparecen ("Datos", "Evolución"). | Actualizarlo en core en 017c-2 (0.1), en el mismo PR que cambia las pestañas. |
| Q16 | El usuario suele tener `next dev --turbopack` corriendo. | Builds en una copia en el scratchpad (10.1), nunca en `apps/web/.next`. |

---

## Decisiones (2026-10-04, modo autónomo del orquestador)

- SDD aprobada. **Q1–Q16 aceptadas con su recomendación, salvo Q6.**
- **Q6 (cambia):** para no esperar merges, cada entrega sale encadenada de la anterior (como 018c/018d), y los PR se
  mergean en orden: `feat/hu-017c-pacientes` (017c-1) → `feat/hu-017c2-ficha` → `feat/hu-017c3-consulta` →
  `feat/hu-017c4-informe`. Cuando se mergee una, la siguiente se rebasea sobre `develop`.
- Implementer: Opus; skills ui-ux-pro-max, apple-design, web-design-guidelines. Reviewer: Opus.
- La migración `food_measures` aplicada en la base de dev (rama 018d) no está en esta rama: `migrate status` la marca;
  no se toca.

## Agregados a 017c-2 (de la revisión y el recorrido de 017c-1)

- R1. "Por completar": que el clic en el disclosure lo cierre aunque haya búsqueda con coincidencias (el usuario manda
  sobre la apertura automática).
- R2. El recorrido de 017c-2 cubre también teclado, 390 px táctil y movimiento reducido de la lista (pasos 9–12 de §10.3).

## Agregados a 017c-3 (del recorrido de 017c-2)

- R3. Error de hidratación en `AppSidebar` (`aside id` / `aria-controls` de `useId` distintos entre servidor y cliente)
  en todas las páginas del panel. Encontrar la causa (render condicional que cambia el orden de hooks/ids, p. ej. un
  `useMediaQuery` que difiere en SSR) y arreglarlo; verificar con la consola limpia al recargar `/pacientes/<id>`.
- R4. Placeholders numéricos con coma decimal ("70,5", no "70.5") en Historial → Nueva medición.

## Agregados a 017c-4 (de la revisión de 017c-3)

- R5. "Calcular requerimiento" se libera apenas llega la página revalidada (`prescription === null`), sin esperar
  `releaseAfterMs`; si no, cambiar el texto del aviso.
- R6. "Quitar plan" (`consultation-plan.tsx`) muestra estado de carga (usar el `isPending` de la transición).
- R7. Borrar un estudio ISAK desde Historial dice "y su informe" cuando el estudio tiene informe (pasar `hasReport`
  a la fila de `evolution-table.tsx`).
