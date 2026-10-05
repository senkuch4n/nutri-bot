# SDD: HU-017d `017d-portal` (Rediseño Apple 4/5: portal del paciente, simple desde el celular)

- **HU validada:** `docs/hu-017d-portal.md`. Manda su sección **"Resoluciones" (2026-10-05)**: D1–D20
  aceptadas con su recomendación, **salvo D14**. D14 cambia: la rama de 017d-3 sale de la de 017d-2
  con un `git merge feat/hu-018d-medidas-caseras` (trae 018c-1, 018c-2 y 018d). Corte **017d-1 →
  017d-2 → 017d-3** en ramas encadenadas. D19 queda pendiente del usuario.
- **Depende de:** HU-017a, 017c y 017b, que ya están en la rama. Reutiliza el contrato de UI de 017a
  (`Refactorizaciones/rediseno-apple-fundaciones.md`) y los patrones de
  `Refactorizaciones/017c-pacientes-consultas.md` y `Refactorizaciones/017b-agenda-gestion.md`:
  `useDeferredDelete`, `PendingUnloadGuard`, `useConfirm`, `useUnsavedChangesGuard`, `Sheet` con
  `side` según el ancho, `replaceUrlInRouter`, `Metric`, `GroupedList` y los helpers de fechas de core.
- **Ramas:** 017d-1 en `feat/hu-017d-portal` (la actual, sale de 017b-4). 017d-2 en
  `feat/hu-017d2-diario`, que sale de la punta de 017d-1. 017d-3 en `feat/hu-017d3-plan`, que sale de
  la punta de 017d-2 y lleva el merge de 018d (T11).
- **Skill aplicado:** `skills/ui.txt`, que baja los objetivos UX a pantallas (vista, estructura base y
  componentes clave). Está en la sección 6 de cada entrega ("Pantallas").
- **Nivel de detalle:** 017d-1 está detallada para implementarse ya. 017d-2 y 017d-3 traen contrato,
  archivos y checklist. Antes de lanzar cada una, el orquestador relee su sección y las Q que le tocan,
  y suma al final lo que haya dejado el recorrido de la entrega anterior.

> **Verificación del architect (2026-10-05, solo lectura).**
> - **Base de desarrollo** (Docker, `nutri`/`nutribot`): la última migración aplicada es
>   `20261004174348_food_measures` (de 018d; no está en esta rama, y `migrate status` la marca hasta
>   el merge de 017d-3). `Professional`: `name = "Nutricionista"` (el valor del seed,
>   `packages/db/prisma/seed.ts:15`), `title` null, `licenseNumber` null y **`phoneJid` null**. Por eso
>   el botón "Escribir por WhatsApp" (D7) **no se ve en dev**: se verifica con tests (Q1, Q6).
> - `DiaryEntry`: 2 filas, ninguna con foto. `EvolutionEntry`: 17 filas, **0 con `note`**, 2 sin peso
>   ni altura (sirven para D5) y 7 con altura. Turnos futuros: 1 `CONFIRMED` y 1 `CANCELLED`.
>   `Patient` con `birthDate`: 3.
> - **El token del portal no se guarda en la base.** `createPatientToken` (`packages/db/domain/patientAuth.ts:4`)
>   es un HMAC con `AUTH_SECRET`: `<patientId>.<vence>.<firma>`. No hay fila para crear ni para borrar.
>   Lo que se crea y se borra por id en las pruebas es **la paciente de prueba** y sus filas (10.3).
> - **El layout no recibe `searchParams`** (Next 15). Por eso hoy ignora `?error=invalid`, y la pantalla
>   de link vencido no se puede resolver solo en `(portal)/layout.tsx` (Q2).
> - **`ConfirmProvider` y `PendingUnloadGuard` solo están en `(panel)/layout.tsx`.** `useConfirm` tira
>   un error fuera del provider (`components/confirm.tsx:107`), así que el portal tiene que montarlos.
> - **Los sheets se montan en `document.body`, afuera de `.theme-portal`.** La regla de 17 px de los
>   campos (`globals.css:256`) no les llega. En táctil igual queda ≥ 16 px (no hay zoom), pero el texto
>   no es el Body del portal. Los sheets del portal llevan `theme-portal` en `SheetContent` (T7).
> - **Sheet con cierre vetado.** Si `onOpenChange(false)` llega desde el arrastre y el dueño no cierra
>   porque pregunta "¿Descartar…?", el panel queda donde lo soltó el dedo. `SheetPanel.onDismiss` hace
>   `setOpen(false)` y nadie devuelve `offset` a 0 (`primitives/sheet.tsx:138-142`). Es el caso de "Anotar
>   comida" con texto (Q4).
> - `serverActions.bodySizeLimit = "6mb"` (`apps/web/next.config.mjs`): una foto de hasta 3 MB entra en
>   una action.
> - `git merge-tree --write-tree HEAD feat/hu-018d-medidas-caseras` hoy da **un solo conflicto**,
>   `progress/current-senkuch4n.md`. `packages/core/src/index.ts` y `progress/history.md` se mezclan
>   solos. Los archivos de `portal/plan/**` no chocan porque esta rama no los tocó. La rama local
>   `feat/hu-018d-medidas-caseras` coincide con `origin` (`aa9f3e6`).
> - El panel también usa `listDiaryEntries` (`(panel)/pacientes/[id]/page.tsx:64`), que trae los bytes
>   de la foto. 017d no lo toca (T3).

---

## 0. Decisiones que valen para las tres entregas

| ID | Decisión | Por qué |
|---|---|---|
| T1 | **017d no agrega migraciones ni cambia `schema.prisma`.** La única migración que entra en la rama es `20261004174348_food_measures`, que trae el merge de 018d (017d-3) y ya está aplicada en la base de dev. Nada de `prisma migrate dev`, `reset`, `resolve` ni `db push`. | HU §3 y §5; pedido del orquestador. |
| T2 | **La lógica pura va en un módulo nuevo `packages/core/src/portal.ts`** con su `portal.test.ts`: saludo, firma, WhatsApp de la profesional, conteo del diario, menor de edad, peso, altura, historial (017d-1) y agrupado del diario por día (017d-2). Reusa `relative-date.ts`, `time.ts`, `agenda.ts` (`firstName`), `professional-identity.ts` y `whatsapp-contact.ts` **sin cambiarlos**. El `export *` se agrega **al final** de `packages/core/src/index.ts`, nunca junto a `./recipes`: así no choca con el merge de 018d (T11). Lo que es mecanismo del navegador (achicar la foto) va en `apps/web/src/lib/` con test de la parte pura. | AGENTS.md "Dónde va la lógica"; HU §6. |
| T3 | **`packages/db` no cambia en 017d-1 ni en 017d-2.** Las consultas nuevas son solo del portal y van en la página, con `select` de lo justo: el historial no lee `note` y el diario no lee `photoData` (Q6). `listDiaryEntries`, `addDiaryEntry` y `deleteDiaryEntry` quedan iguales. Igual se corre `typecheck` en los 4 workspaces, porque core cambia y el bot importa core. | AGENTS.md "El contrato"; HU §6 "Consultas". |
| T4 | **El bot no cambia** (`apps/bot/**` y `packages/core/src/messages.ts` sin diff). Los textos nuevos del portal van en `PORTAL_TEXT` (core). | HU §4.6. |
| T5 | **Las props nuevas de componentes compartidos son opcionales y su default es igual a lo de hoy:** `DaySelector.today?` (017d-3). `EvolutionChart` cambia solo por dentro (sin animación con movimiento reducido). `SheetPanel` cambia solo por dentro (vuelve a su lugar si se veta el cierre, Q4). No cambian firmas de `ui.tsx`, `grouped-list.tsx`, `deferred-delete.ts`, `confirm.tsx` ni de funciones existentes de core. | R1 de la madre; T5 de 017b. |
| T6 | **La zona de imleticio no cambia de archivo:** `alimentos/**`, `pacientes/[id]/planes/**`, `plantillas/**`, `components/food-picker.tsx`, `components/meals-editor.tsx`, `lib/meal-view.ts` y `lib/plan-pdf.tsx`. `components/macro-totals.tsx` no cambia. `components/weekly-menu/day-selector.tsx` solo suma `today?` (017d-3), y el editor no lo pasa. **El diff de 017d contra la punta de 018d** no tiene esos archivos. Los cambios que sí trae el merge son de 018 y no cuentan (10.2 de 017d-3). | HU §2.4 y §5. |
| T7 | **UI:** Body del portal a 17 px (`text-body-lg`), títulos con la escala de 017a (`text-large-title`, `text-title-1/2/3`, `text-headline`), botones `size="lg"` (44 px) siempre con texto, y el ícono es opcional. Los `SheetContent` del portal llevan `theme-portal` en `className` (ver la verificación). Movimiento: solo `m.*` de `motion/react` y los presets de `lib/motion.ts`; se anima `opacity`/`transform`; con movimiento reducido, `MotionConfig reducedMotion="user"` deja solo el fundido. | 017a §7, §18. |
| T8 | **Datos y WhatsApp.** El recorrido sobre pacientes reales es **de solo lectura** (token generado en local, sin escribir). Anotar, borrar y deshacer se prueban solo con **la paciente de prueba** de 10.3 (JID inventado) y se limpia **por id**. Las pruebas con turnos se hacen **con el proceso del bot apagado**: el cron de señas vencidas (`expireStalePendingPayments`) y el de recordatorios encolarían mensajes al JID de prueba. El botón "Escribir por WhatsApp" se verifica mirando el `href`, sin tocarlo. | AGENTS.md, reglas duras; HU §6. |
| T9 | **Lecciones de runtime de 017c/017b:** (a) el servidor nunca le pasa funciones ni componentes (íconos incluidos) a un componente cliente: los íconos se importan del lado cliente y las props son strings, números, booleanos, objetos planos o elementos ya renderizados; (b) la URL se cambia con `replaceUrlInRouter` (`lib/patient-tab-route.ts`, `replaceState(null, …)`) o con el router de Next, nunca con `window.history.state`; (c) un archivo `"use server"` exporta solo funciones async y `export type` declarados ahí, sin re-exportar tipos; (d) los borrados diferidos son idempotentes: la key es por id (`diary:<id>`), un segundo pedido con la key pendiente no hace nada (`runDeferredDelete` devuelve `false`) y la action de borrar responde `ok` si el registro ya no existe; (e) **ids estables:** en lo que dibuja el layout (pantalla de acceso, header) no se usa `useId` en el DOM, sino ids fijos con prefijo `portal-` (lección del sidebar de 017b-4); (f) "hoy", "ayer", la hora y las fechas se calculan en el servidor con `pro.timezone`; (g) cada entrega se verifica en runtime con `next start` en un puerto libre, además de los builds de webpack y Turbopack. | Reviews de 017c y 017b; HU §1.2. |
| T10 | **Lenguaje:** ningún texto del portal dice "registro guardado", "sesión", "token", "inválido", "kcal" ni "macros". Los errores dicen qué pasó y qué hacer, en una frase. Esto incluye los errores que devuelven las actions del diario (017d-2) y `error.tsx`, que deja de mostrar "Código: …". | HU §2.4 "Lenguaje". |
| T11 | **017d-3 = merge de 018d + presentación.** Primero el merge en su propio commit, con los conflictos resueltos según 7-3. Después `npm install`, `npm run db:generate` y reiniciar el dev server. Recién ahí van los cambios de presentación. 017d-1 y 017d-2 **no tocan** `portal/plan/**`, `components/recipes/**`, `components/recipe-picker/**`, `components/weekly-menu/**`, `lib/portal-recipe.ts` ni `lib/meal-view.ts`, así el merge no choca en código. | Resolución D14. |

---

# Entrega 017d-1: acceso, inicio y evolución (detallada)

## 1-1. Resumen funcional

La paciente (o su mamá o papá) entra al portal desde el link del bot. Si el link venció, ve "Este link
ya venció" con cómo pedir otro, distinto de cuando entra sin link. El header ya no tiene "Salir": pasa
al final del inicio como "Salir del portal" y pide confirmación. El inicio la saluda por el nombre de
pila en grande. Destaca el próximo turno en palabras ("Mañana, 10:00"), incluido el que espera la seña.
Tiene tarjetas enteras tocables para el plan y la evolución, y una tarjeta del diario con "Hoy anotaste
2 comidas" y el botón "Anotar comida". En Evolución ve su último peso como número grande y, si tiene,
la altura. El cambio de peso va en palabras neutras, sin colores ni flechas, y a los menores no se les
muestra. Abajo están el gráfico y un historial que solo tiene filas con peso o altura, **sin las notas
clínicas** de la nutricionista.

## 2-1. Workspaces afectados

| Workspace | ¿Cambia? | Qué |
|---|---|---|
| `packages/core` | **sí** | `portal.ts` + `portal.test.ts` (nuevos) y un `export *` al final de `index.ts` |
| `packages/db` | no | — (T3) |
| `apps/web` | **sí** | Layout, header, acceso, inicio, evolución, loading y error del portal; `lib/shell.ts` (una función nueva); `components/portal/*` (nuevos); `components/evolution-chart.tsx` (movimiento reducido) |
| `apps/bot` | no | `typecheck` igual, porque importa core |

## 3-1. Esquema

Sin cambios (T1). Lecturas: `Appointment` (`CONFIRMED`/`AWAITING_PAYMENT` futuros), `NutritionPlan`
(`ACTIVE`, solo `title`), `EvolutionEntry` (`recordedAt`, `weightKg`, `heightCm`; **nunca `note`**),
`DiaryEntry` (conteo de hoy), `Patient.name`/`birthDate` y `Professional.phoneJid`.

## 4-1. Contrato compartido

### 4.1 `packages/core/src/portal.ts` (nuevo; lo consume `apps/web`, el bot no)

Imports: `firstName` (`./agenda`); `professionalSignature`, `type ProfessionalIdentity`
(`./professional-identity`); `classifyWhatsappJid` (`./whatsapp-contact`); `capitalizeFirst`,
`formatTimeAgo` (`./relative-date`); `dayKeyInTz`, `wallTimeToUtc`, `formatInTimeZone` (`./time`);
`es` de `date-fns/locale`; `type WeightPoint` (`./patient-summary`).

```ts
/** Textos exactos del portal (HU §2 y §4). */
export const PORTAL_TEXT = {
  // Acceso (D8)
  noLinkTitle: "Para entrar necesitás un link",
  noLinkBody: "Escribile portal a tu nutricionista por WhatsApp y te mandamos uno.", // "portal" va en <strong>
  expiredTitle: "Este link ya venció",
  expiredBody: "Por seguridad, cada link dura 15 minutos. Escribí portal por WhatsApp y te mandamos uno nuevo.",
  writeWhatsapp: "Escribir por WhatsApp",
  // Inicio
  nextAppointmentLabel: "Tu próximo turno",
  awaitingDeposit: "Falta pagar la seña para confirmarlo",
  noAppointmentsTitle: "No tenés turnos próximos.",
  noAppointmentsBody: "Escribile a tu nutricionista por WhatsApp para sacar uno.",
  planTitle: "Tu plan",
  planHint: "Mirá qué comer hoy",
  noPlan: "Todavía no tenés un plan.",
  diaryTitle: "Tu diario",
  diaryQuestion: "¿Qué comiste hoy?",
  addMeal: "Anotar comida",
  evolutionTitle: "Tu evolución",
  lastWeightLabel: "Tu último peso",
  noWeightYet: "Cuando tu nutricionista te pese, lo vas a ver acá.",
  insurancesTitle: "Obras sociales que atiende",
  logout: "Salir del portal",
  logoutConfirmTitle: "¿Salir del portal?",
  logoutConfirmBody: "Para volver a entrar vas a tener que pedir un link nuevo por WhatsApp.",
  logoutConfirm: "Salir",
  logoutCancel: "Cancelar",
  // Evolución
  weightLabel: "Peso",
  heightLabel: "Altura",
  chartSingle: "Cuando haya más registros, vas a ver cómo cambia.",
  historyTitle: "Historial",
  noRecordsTitle: "Todavía no hay registros",
  noRecordsBody: "Cuando tu nutricionista te pese, lo vas a ver acá.",
  // Errores (error.tsx)
  errorTitle: "Algo salió mal",
  errorBody: "No pudimos mostrar esta pantalla. Probá de nuevo.",
  retry: "Reintentar",
  backHome: "Volver al inicio",
} as const;

/** "Hola, María 👋" (firstName del nombre); sin nombre (null, "", espacios) → "Hola 👋". */
export function portalGreeting(patientName: string | null): string;

/** "Tu espacio con Lic. Daiana Ponce · M.P. 852" (professionalSignature, con matrícula como hoy).
 *  Sin nombre → "Tu espacio con tu nutricionista". "Sin nombre" = name vacío/espacios, o name igual a
 *  "Nutricionista" (sin distinguir mayúsculas ni tildes, con trim) y title vacío: el valor del seed (Q1). */
export function portalProfessionalLine(p: ProfessionalIdentity): string;

/** "https://wa.me/5493515552345" solo si phoneJid es de tipo "phone" (classifyWhatsappJid) y tiene
 *  dígitos. Los dígitos se toman antes de "@" y antes de ":" (sufijo de dispositivo "549…:12@s.whatsapp.net").
 *  null, "", "@lid", grupos y difusión → null (D7). */
export function professionalWhatsappUrl(phoneJid: string | null): string | null;

/** 0 → null; 1 → "Hoy anotaste 1 comida"; n → "Hoy anotaste n comidas" (D17). */
export function diaryTodayText(count: number): string | null;

/** Instante UTC de las 00:00 de hoy en tz: wallTimeToUtc(dayKeyInTz(now, tz), "00:00", tz). */
export function startOfTodayInTz(now: Date, tz: string): Date;

/** true si a la fecha de hoy en tz todavía no cumplió 18. birthDate es @db.Date (medianoche UTC): se
 *  lee con getUTCFullYear/getUTCMonth/getUTCDate y se compara con dayKeyInTz(now, tz). null → false (D3). */
export function isMinorOn(birthDate: Date | null, now: Date, tz: string): boolean;

/** "12 de septiembre" en tz; si el año no es el de now (en tz): "12 de septiembre de 2025". */
export function formatPortalDate(instant: Date, now: Date, tz: string): string;

/** "62,4 kg" (es-AR, hasta 1 decimal, espacio común antes de la unidad). */
export function formatWeightKg(kg: number): string;

/** 132 → "1,32 m"; 165,5 → "1,66 m" (cm/100, exactamente 2 decimales, es-AR). */
export function formatHeightMeters(cm: number): string;

export interface PortalWeightSummary {
  latestKg: number;
  /** "Último registro: hace 3 semanas" | "Último registro: hoy" | "Último registro: ayer" (formatTimeAgo). */
  latestAgoText: string;
  /** formatTimeAgo solo ("hace 3 semanas"), para la tarjeta del inicio. */
  latestAgo: string;
  /** Contra el peso anterior, redondeado a 1 decimal (D3):
   *  < 0 → "2 kg menos que el 3 de agosto"; > 0 → "1,2 kg más que el 3 de agosto";
   *  0 → "Igual que el 3 de agosto". Fecha con formatPortalDate. null si hay un solo peso o si
   *  hideChange (menores). */
  changeText: string | null;
}
/** null si ningún punto tiene peso. Ignora puntos sin peso; el orden de entrada no importa. */
export function portalWeightSummary(
  points: readonly WeightPoint[], now: Date, tz: string, opts: { hideChange: boolean },
): PortalWeightSummary | null;

export interface PortalHeightSummary {
  cm: number;
  /** "1,32 m" */
  text: string;
  /** "Medida hace 2 meses" | "Medida hoy" | "Medida ayer" */
  agoText: string;
}
/** La altura más reciente; null si no hay ninguna (D4). */
export function portalHeightSummary(
  points: readonly { heightCm: number | null; recordedAt: Date }[], now: Date, tz: string,
): PortalHeightSummary | null;

export interface PortalEvolutionRow {
  id: string;
  /** "12 de septiembre" (formatPortalDate) */
  dateLabel: string;
  /** "62,4 kg" | null */
  weightText: string | null;
  /** "1,32 m" | null */
  heightText: string | null;
}
/** Solo las filas con peso o altura (D5), de la más nueva a la más vieja. Ningún otro campo entra
 *  (D2: la entrada no tiene `note`). */
export function portalEvolutionRows(
  entries: readonly { id: string; recordedAt: Date; weightKg: number | null; heightCm: number | null }[],
  now: Date,
  tz: string,
): PortalEvolutionRow[];
```

- El formateo de números usa `Intl.NumberFormat("es-AR", …)` con constantes del módulo, como
  `patient-summary.ts`.
- **Fin de `packages/core/src/index.ts`:** `export * from "./portal";` como **última línea** (T2/T11).
- Nombres que no chocan con core: hay que verificar que ningún `export` de core se llame
  `PORTAL_TEXT`, `portalGreeting`, `formatWeightKg`, `formatHeightMeters` ni `formatPortalDate`
  (`grep -rn "export .*formatWeightKg\|…" packages/core/src`). En la rama de 018d tampoco existen:
  `git grep -n "formatWeightKg\|formatHeightMeters\|formatPortalDate\|PORTAL_TEXT" feat/hu-018d-medidas-caseras -- packages/core/src`
  tiene que salir vacío. Si alguno existiera, se renombra con el prefijo `portal`.

### 4.2 `apps/web/src/lib/shell.ts` (una función nueva)

```ts
/** HU-017d-1 (D7, D8): nombre del portal y link de WhatsApp de la profesional para la pantalla de acceso
 *  del layout. Igual que getProfessionalPortalName: nunca tira (ante error → { name: null, whatsappUrl: null }). */
export async function getProfessionalPortalContact(): Promise<{ name: string | null; whatsappUrl: string | null }>;
```

Lee `prisma.professional.findUnique({ where: { id: 1 }, select: { name: true, title: true, phoneJid: true } })`.
`name` se arma como en `getProfessionalPortalName` y `whatsappUrl` sale de `professionalWhatsappUrl(phoneJid)`.
`getProfessionalPortalName` queda igual porque la usa el header. El layout llama **una** de las dos, no
las dos (4.3).

### 4.3 Layout y acceso

**`(portal)/layout.tsx`:**
- `Promise.all([getPortalPatient(), getProfessionalPortalContact()])`. El `PortalHeader` recibe
  `professionalName={contact.name}`.
- Sin paciente: `<Suspense fallback={<PortalAccessScreen variant="no-link" professionalName={…} whatsappUrl={…} />}>`
  envuelve `<PortalAccessGate professionalName={…} whatsappUrl={…} />`. El `Suspense` evita el aviso de
  `useSearchParams` en el build. Las props son strings o null (T9a).
- Con paciente: igual que hoy, más `<ConfirmProvider>`, que envuelve header, `main`, `PortalNav` y
  `Toaster`. `PendingUnloadGuard` entra recién en 017d-2.

**`apps/web/src/components/portal/portal-access.tsx` (nuevo, `"use client"`):**

```tsx
export function PortalAccessGate(props: { professionalName: string | null; whatsappUrl: string | null }): JSX.Element;
// useSearchParams().get("error") === "invalid" ? variant "expired" : "no-link"
export function PortalAccessScreen(props: {
  variant: "no-link" | "expired";
  professionalName: string | null;
  whatsappUrl: string | null;
}): JSX.Element;
```

- Misma caja que hoy (`max-w-sm`, `rounded-xl bg-card p-8 shadow-card`, `Wordmark`), con estas
  diferencias:
  - `no-link`: el título `h1` es `PORTAL_TEXT.noLinkTitle` y el texto es `noLinkBody`, con "portal" en
    `<strong>`.
  - `expired`: arriba va el ícono `Clock` (lucide, importado en este archivo) en un círculo
    `bg-secondary` de 56 px. El título es `expiredTitle` y el texto `expiredBody`, con "portal" en
    `<strong>`.
- Si hay `whatsappUrl`, en las dos variantes va un `<a href={whatsappUrl} target="_blank" rel="noopener noreferrer">`
  con el aspecto de `buttonVariants({ variant: "tinted", size: "lg" })`, ancho completo, con
  `MessageCircle` y el texto "Escribir por WhatsApp" + `<span className="sr-only"> (se abre en otra pestaña)</span>`.
- Ids fijos (T9e): `id="portal-access-title"` en el `h1` y `aria-labelledby` en la caja (`role="region"`).
- **Nada en `/portal/login/route.ts`:** ya redirige a `/portal?error=invalid`. Un link vencido con una
  cookie todavía válida entra al inicio, como hoy.

**`components/shell/portal-header.tsx`:** se saca el `<form action="/portal/logout">` con "Salir" (D9).
El header queda con la marca y, desde `md`, las pestañas. También se sacan los imports de `LogOut` y
`Button`. `activeHref` sigue (lo usa `dev-diseno-portal/portal-demo.tsx`).

### 4.4 Inicio (`(portal)/portal/page.tsx`, servidor)

Consultas (un `Promise.all`; `now = new Date()`):

```ts
getProfessional(),
prisma.appointment.findFirst({
  where: { patientId: patient.id, status: { in: ["CONFIRMED", "AWAITING_PAYMENT"] }, startsAt: { gte: now } },
  orderBy: { startsAt: "asc" },
  select: { startsAt: true, status: true, priceSnapshot: true, service: { select: { name: true } } },
}),
prisma.nutritionPlan.findFirst({
  where: { patientId: patient.id, status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, select: { title: true },
}),
prisma.evolutionEntry.findFirst({
  where: { patientId: patient.id, weightKg: { not: null } }, orderBy: { recordedAt: "desc" },
  select: { weightKg: true, recordedAt: true },
}),
// el conteo necesita tz: va después de getProfessional, o en un segundo await
prisma.diaryEntry.count({ where: { patientId: patient.id, createdAt: { gte: startOfTodayInTz(now, pro.timezone) } } }),
```

- **D6:** el primero por `startsAt` entre confirmados y con seña es exactamente lo que pide la HU (si
  hay un confirmado antes, gana ese).
- Para no sumar un viaje en serie, `getProfessional()` va primero y lo demás en un `Promise.all`
  (`pro.timezone` hace falta para el conteo). Son 2 rondas, como hoy.
- Textos: `portalGreeting(patient.name)`, `portalProfessionalLine({ title: pro.title, name: pro.name, licenseNumber: pro.licenseNumber })`,
  `formatAppointmentWhen(appt.startsAt, now, pro.timezone)`, `formatPrice(appt.priceSnapshot.toString(), pro.currency)`,
  `diaryTodayText(count)`, `formatWeightKg(Number(latest.weightKg))`, `formatTimeAgo(latest.recordedAt, now, tz)`,
  `professionalWhatsappUrl(pro.phoneJid)`, `messages.formatInsuranceList(pro.acceptedInsurances)`.

### 4.5 Componentes nuevos del portal (`apps/web/src/components/portal/`)

```tsx
// portal-card-link.tsx (server-safe, sin "use client")
/** Tarjeta entera tocable (D3 de la madre, PO3): un único <Link>, press de tarjeta (escala 0,985) y
 *  tono al apretar, flecha a la derecha. `label` = nombre accesible ("Tu plan: Plan de octubre"). */
export function PortalCardLink(props: { href: string; label: string; children: React.ReactNode }): JSX.Element;
```
Clases: `group relative flex items-center gap-4 rounded-xl bg-card p-5 shadow-card more-contrast:border more-contrast:border-input press-sm pressed:bg-overlay-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`.
Hijos en `min-w-0 flex-1`, y a la derecha `ChevronRight` (`size-5 text-tertiary`, `aria-hidden`).
`aria-label={label}`, y el contenido visible también va dentro del link.

```tsx
// portal-logout-button.tsx ("use client")
/** "Salir del portal" (D9): plain, gris, 44 px, al final del inicio. useConfirm → POST /portal/logout. */
export function PortalLogoutButton(): JSX.Element;
```
Va con un `<form ref action="/portal/logout" method="POST">` oculto y un `<Button type="button" variant="plain" size="lg" className="w-full text-muted-foreground">`
con `LogOut`. Al tocar:
`if (await confirm({ title: logoutConfirmTitle, description: logoutConfirmBody, confirmLabel: logoutConfirm, cancelLabel: logoutCancel, destructive: true })) formRef.current?.requestSubmit()`.
Es el mismo POST de hoy y `logout/route.ts` no cambia.

### 4.6 Evolución (`(portal)/portal/evolucion/page.tsx`, servidor)

```ts
const entries = await prisma.evolutionEntry.findMany({
  where: { patientId: patient.id },
  orderBy: { recordedAt: "desc" },
  select: { id: true, recordedAt: true, weightKg: true, heightCm: true }, // D2: sin `note`
});
const pts = entries.map((e) => ({ id: e.id, recordedAt: e.recordedAt,
  weightKg: e.weightKg === null ? null : Number(e.weightKg), heightCm: e.heightCm === null ? null : Number(e.heightCm) }));
const hideChange = isMinorOn(patient.birthDate, now, pro.timezone);
const weight = portalWeightSummary(pts, now, tz, { hideChange });
const height = portalHeightSummary(pts, now, tz);
const rows = portalEvolutionRows(pts, now, tz);
const chartPoints = pts.filter((p) => p.weightKg !== null).map((p) => ({ date: p.recordedAt, value: p.weightKg! }));
```

`EvolutionChart` es un componente cliente y recibe `points` con `Date`, que sí se serializan (como
hoy). **`components/evolution-chart.tsx`:** se suma `const reduced = useReducedMotionConfig()` de
`motion/react` y `isAnimationActive={!reduced}` en `<Bar>`. No cambian las props y el panel queda igual
salvo con movimiento reducido.

### 4.7 Rutas, server actions y API

| Ruta | Cambio |
|---|---|
| `/portal` | Inicio nuevo (4.4); sin sesión: pantalla de acceso con `?error=invalid` → "Este link ya venció" |
| `/portal/evolucion` | Evolución nueva (4.6) |
| `/portal/login`, `/portal/logout`, `/portal/plan/pdf`, `/portal/diario/photo/[id]`, `/portal/recetas/fotos/[photoId]` | Sin cambios |
| Middleware | Sin cambios: el matcher ya excluye `portal` |

Ninguna server action nueva en 017d-1.

### 4.8 Mensajes del bot

Ninguno cambia (T4). `messages.portalLink` ya dice "válido por 15 minutos", que coincide con
`expiredBody`.

## 5-1. Diseño (lo que implementa el implementer)

### 5.1 Inicio (`/portal`), de arriba hacia abajo (`space-y-4`, el saludo con `mb-2`)

```
Hola, María 👋                                   h1 text-large-title text-balance
Tu espacio con Lic. Daiana Ponce · M.P. 852      p text-body-lg text-muted-foreground

┌ 📅 Tu próximo turno ─────────────────────┐      Card destacada (no navega)
│ Mañana, 10:00                           │      text-title-2 (fecha)
│ Control · $ 15.000                      │      text-body-lg text-muted-foreground
│ ⚠ Falta pagar la seña para confirmarlo  │      solo AWAITING_PAYMENT: CircleAlert + text-callout text-warning
└─────────────────────────────────────────┘
  vacío: "No tenés turnos próximos." (headline) + noAppointmentsBody (body-lg secundario)
         + [💬 Escribir por WhatsApp] tinted lg w-full (solo si whatsappUrl) — <a target=_blank>

┌ Tu plan                              ›  ┐      PortalCardLink href=/portal/plan, label "Tu plan: {título}"
│ {título del plan}  (headline)           │
│ Mirá qué comer hoy (body-lg secundario) │
└─────────────────────────────────────────┘
  sin plan: Card no tocable "Tu plan" + "Todavía no tenés un plan."

┌ Tu diario ──────────────────────────────┐      Card (no tocable)
│ ¿Qué comiste hoy?            (headline) │
│ Hoy anotaste 2 comidas   (body-lg sec.) │      solo si count > 0
│ [✎ Anotar comida]  primary lg w-full    │      017d-1: ButtonLink href=/portal/diario
└─────────────────────────────────────────┘      (017d-2: href=/portal/diario?anotar=1)

┌ Tu evolución                         ›  ┐      PortalCardLink href=/portal/evolucion, label "Tu evolución"
│ Metric label="Tu último peso" value=62.4 unit="kg" caption="hace 3 semanas"
│ sin peso: "Cuando tu nutricionista te pese, lo vas a ver acá."
└─────────────────────────────────────────┘

Obras sociales que atiende                       solo si hay: Card title + <ul> simple (text-body-lg, una por renglón)

[⎋ Salir del portal]                             PortalLogoutButton (plain, gris, 44 px)
```

- La etiqueta "Tu próximo turno" va en `text-subheadline font-semibold text-primary` con `CalendarDays`
  (`size-4`, `aria-hidden`). La tarjeta destacada tiene `p-6` y las demás `p-5`.
- Los títulos de tarjeta ("Tu plan", "Tu diario", "Tu evolución") van en `text-subheadline font-semibold
  text-muted-foreground` arriba del contenido, y el contenido principal en `text-headline`.
- `Metric` con `size="lg"` en el inicio. **No** usa `trend`, que pinta flecha y color (D3).
- Se elimina el `Badge` de obras sociales (era un chip gris de sistema).

### 5.2 Evolución (`/portal/evolucion`)

```
Tu evolución                                     h1 text-title-1
┌──────────────────────────────────────────┐
│ Peso                 │ Altura             │   grid grid-cols-2 gap-4 (una columna si no hay altura)
│ 62,4 kg              │ 1,32 m             │   Metric size="lg" · altura: valueText={height.text}
│ Último registro: …   │ Medida hace 2 meses│   caption
│ 2 kg menos que el 3 de agosto            │   changeText (text-callout text-muted-foreground), col-span-2
└──────────────────────────────────────────┘
┌ Peso ────────────────────────────────────┐   Card: EvolutionChart (≥ 2 pesos, height 220, unit "kg")
│ …                                        │   1 peso: PORTAL_TEXT.chartSingle (body-lg secundario)
└──────────────────────────────────────────┘   0 pesos: no se muestra la tarjeta
Historial                                        GroupedList header="Historial"
  12 de septiembre              62,4 kg · 1,32 m GroupedListRow label=dateLabel value=[weightText, heightText].filter(Boolean).join(" · ")
  …
```

- Sin ningún registro con peso ni altura: un `Card` con `EmptyState` (ícono `TrendingUp` importado en
  la página, que es un server component y lo dibuja ahí) con `noRecordsTitle`/`noRecordsBody`, y nada
  más.
- Sin peso pero con altura: solo el `Metric` de altura, sin gráfico, y el historial.
- `Metric` de peso: `label="Peso"`, `value={weight.latestKg}`, `unit="kg"`, `caption={weight.latestAgoText}`.
  De altura: `label="Altura"`, `value={height.cm}`, `valueText={height.text}`, `caption={height.agoText}`.
- `changeText` va **fuera** de `Metric` (no hay `trend`): texto gris, sin ícono, sin color.

### 5.3 Estados

- **`loading.tsx`:** `role="status"` con un esqueleto que tiene la forma del inicio nuevo:
  `Skeleton h-10 w-56`, `h-5 w-72 max-w-full`, una tarjeta destacada `h-32 rounded-xl` y tres
  `CardSkeleton lines={2} bare`.
- **`error.tsx`:** `PORTAL_TEXT.errorTitle`/`errorBody`, "Reintentar" (`Button lg`) y "Volver al inicio"
  (`ButtonLink secondary lg`), **sin `detail`** (T10).

## 6-1. Pantallas (skill `ui`)

| Vista | Estructura base | Componentes clave |
|---|---|---|
| Sin link | Pantalla centrada sin header ni tab bar, fondo agrupado cálido | Caja `Card` con `Wordmark`, `h1` "Para entrar necesitás un link", texto con **portal** resaltado, botón `tinted` "Escribir por WhatsApp" (si hay teléfono) |
| Link vencido | Igual que "Sin link" | Ícono de reloj en círculo, "Este link ya venció", texto de 15 minutos, mismo botón |
| Inicio | Header con material (marca + nombre, pestañas desde 768 px, **sin Salir**), contenido `max-w-2xl`, tab bar abajo en el celular | Saludo `large-title`; `Card` destacada del turno; `PortalCardLink` ×2 (plan, evolución); `Card` del diario con botón lleno; lista de obras sociales; botón `plain` "Salir del portal" → `AlertDialog` (`useConfirm`) |
| Evolución | Mismo shell | `Metric` ×1–2 en una tarjeta, texto neutral del cambio, `EvolutionChart` en `Card`, `GroupedList` del historial, `EmptyState` |
| Cargando | Mismo shell | Esqueleto del inicio |
| Error | Mismo shell | `StatusScreen` con dos botones |

## 7-1. Archivos y flujo

### 7.1 Flujo de acceso

```
link del bot → /portal/login?token=…
  ├─ token válido → cookie patient_session (30 días, path /portal) → /portal → inicio
  └─ token vencido/adulterado → /portal?error=invalid → layout sin paciente
        → <Suspense><PortalAccessGate/></Suspense> → useSearchParams: "invalid" → "Este link ya venció"
/portal sin cookie ni error → "Para entrar necesitás un link"
"Salir del portal" → useConfirm → POST /portal/logout → cookie borrada → /portal → "Para entrar necesitás un link"
```

### 7.2 Archivos

| Archivo | Acción |
|---|---|
| `packages/core/src/portal.ts` | nuevo (4.1) |
| `packages/core/src/portal.test.ts` | nuevo (9-1) |
| `packages/core/src/index.ts` | `export * from "./portal";` al final |
| `apps/web/src/lib/shell.ts` | `getProfessionalPortalContact` (4.2) |
| `apps/web/src/app/(portal)/layout.tsx` | contacto, acceso con `Suspense`, `ConfirmProvider` (4.3) |
| `apps/web/src/components/portal/portal-access.tsx` | nuevo (4.3) |
| `apps/web/src/components/portal/portal-card-link.tsx` | nuevo (4.5) |
| `apps/web/src/components/portal/portal-logout-button.tsx` | nuevo (4.5) |
| `apps/web/src/components/shell/portal-header.tsx` | sin "Salir" (4.3) |
| `apps/web/src/app/(portal)/portal/page.tsx` | inicio (4.4, 5.1) |
| `apps/web/src/app/(portal)/portal/evolucion/page.tsx` | evolución (4.6, 5.2) |
| `apps/web/src/components/evolution-chart.tsx` | `isAnimationActive={!reduced}` (4.6) |
| `apps/web/src/app/(portal)/portal/loading.tsx` | esqueleto del inicio (5.3) |
| `apps/web/src/app/(portal)/portal/error.tsx` | textos de `PORTAL_TEXT`, sin `detail` (5.3) |
| `apps/web/src/components/portal/portal-access.test.tsx` | nuevo (9-1) |
| `progress/impl_HU-017d.md` | sección "017d-1" |

**No se tocan:** `portal/plan/**`, `portal/diario/**`, `components/shell/portal-nav.tsx`,
`lib/patient-session.ts`, `portal/login/route.ts`, `portal/logout/route.ts` ni `middleware.ts`.

## 8-1. Checklist atómico (un commit por fase)

> Cada paso termina con el `typecheck` del workspace que toca en verde. `git add` solo los archivos de
> la fase: en el árbol hay archivos ajenos sin trackear (`.mcp.json`, `docker-compose.prod.yml`,
> `hus-last-meet.md`, `apps/bot/.whatsapp-auth.vieja*/`, `docs/auditoria-apple/017a/`) que **no** se
> agregan. Trailer `Co-Authored-By` del implementer.

### Fase 0: preflight (sin commit)

- [ ] 0.1 `git status` y `git log -1` en `feat/hu-017d-portal`. La rama contiene 017b-4:
      `git merge-base --is-ancestor 0aec47b HEAD` sale con exit 0.
- [ ] 0.2 `npm run db:generate` (no toca la base). Nada de `prisma migrate`.
- [ ] 0.3 Ver si el usuario tiene un `next dev` corriendo (`lsof -iTCP -sTCP:LISTEN -P | grep node`).
      Si lo hay, el build va en una copia (10.1).
- [ ] 0.4 Capturas **antes** (solo lectura, con el token de una paciente real, 10.3 paso 1): `/portal`
      y `/portal/evolucion` a 390×844 → `docs/auditoria-apple/017d/antes/` (no se commitean salvo que se
      pida).
- [ ] 0.5 Abrir `progress/impl_HU-017d.md` con la sección "017d-1".

### Fase 1: core (commit `HU-017d-1: textos, peso, altura e historial del portal (core)`)

- [ ] 1.1 `portal.ts` con `PORTAL_TEXT` y las funciones de 4.1.
- [ ] 1.2 `portal.test.ts` (9-1). `npx vitest run packages/core/src/portal.test.ts`.
- [ ] 1.3 `export * from "./portal";` al final de `index.ts`. `npm run typecheck --workspace packages/core`
      y `--workspace apps/bot`.

### Fase 2: acceso y shell (commit `HU-017d-1: link vencido distinto de sin link y Salir fuera del header`)

- [ ] 2.1 `getProfessionalPortalContact` en `lib/shell.ts`.
- [ ] 2.2 `components/portal/portal-access.tsx` (`PortalAccessGate` + `PortalAccessScreen`, ids fijos).
- [ ] 2.3 `layout.tsx`: contacto, `Suspense` + gate sin paciente, `ConfirmProvider` con paciente.
- [ ] 2.4 `portal-header.tsx` sin "Salir" ni sus imports.
- [ ] 2.5 `loading.tsx` y `error.tsx` (5.3).
- [ ] 2.6 `portal-access.test.tsx` (9-1). `npm run typecheck --workspace apps/web`.

### Fase 3: inicio (commit `HU-017d-1: inicio con saludo, próximo turno en palabras y tarjetas tocables`)

- [ ] 3.1 `components/portal/portal-card-link.tsx`.
- [ ] 3.2 `components/portal/portal-logout-button.tsx`.
- [ ] 3.3 `portal/page.tsx` (4.4, 5.1). Los íconos se importan en el componente que los dibuja (T9a).
- [ ] 3.4 `npm run typecheck --workspace apps/web`.

### Fase 4: evolución (commit `HU-017d-1: evolución con último peso, altura y historial sin notas`)

- [ ] 4.1 `evolucion/page.tsx` (4.6, 5.2), con el `select` sin `note`.
- [ ] 4.2 `evolution-chart.tsx`: `useReducedMotionConfig` + `isAnimationActive`.
- [ ] 4.3 `npm run typecheck`, los 4 workspaces.

### Fase 5: verificación y cierre (commit `HU-017d-1: implementación y verificación`, solo `progress/impl_HU-017d.md`)

- [ ] 5.1 10-1 completo (comandos, builds, runtime, alcance del diff).
- [ ] 5.2 Anotar en `progress/impl_HU-017d.md`: archivos, resultados, ids de prueba creados y borrados,
      conteos antes/después, capturas y lo que quede para el recorrido.

## 9-1. Tests (vitest, `npm run test` desde la raíz)

**`packages/core/src/portal.test.ts`** (tz `America/Argentina/Buenos_Aires`, `now` fijo
`2026-10-07T15:00:00Z` = martes 7/10 12:00 en Argentina):

- `portalGreeting`: "María Laura López" → "Hola, María 👋"; `"  ana  "` → "Hola, ana 👋"; null, "" y
  "   " → "Hola 👋".
- `portalProfessionalLine`: con título y matrícula → "Tu espacio con Lic. Daiana Ponce · M.P. 852"; sin
  matrícula → "Tu espacio con Lic. Daiana Ponce"; `name: ""` → "Tu espacio con tu nutricionista";
  `name: "Nutricionista", title: null` → "Tu espacio con tu nutricionista"; `" nutricionista "` → igual;
  `name: "Nutricionista", title: "Lic."` → "Tu espacio con Lic. Nutricionista" (con título no se
  considera el valor del seed, Q1).
- `professionalWhatsappUrl`: `"5493515552345@s.whatsapp.net"` → `https://wa.me/5493515552345`;
  `"5493515552345:12@s.whatsapp.net"` → mismo; `"5493515552345@c.us"` → mismo; `"12345@lid"`, null, "",
  `"123@g.us"`, `"status@broadcast"` y `"@s.whatsapp.net"` (sin dígitos) → null.
- `diaryTodayText`: 0 → null; 1 → "Hoy anotaste 1 comida"; 2 → "Hoy anotaste 2 comidas".
- `startOfTodayInTz`: con `now` = 7/10 02:30Z (6/10 23:30 en Argentina) → `2026-10-06T03:00:00.000Z`;
  con el `now` fijo → `2026-10-07T03:00:00.000Z`.
- `isMinorOn`: birthDate `2008-10-07` → false (cumple 18 hoy); `2008-10-08` → true; con `now` =
  `2026-10-08T01:00:00Z` (7/10 22:00 en Argentina) y birthDate `2008-10-08` → true (en Argentina todavía
  es 7); null → false; `2021-03-01` (5 años) → true.
- `formatPortalDate`: 12/9/2026 → "12 de septiembre"; 12/9/2025 → "12 de septiembre de 2025"; un
  instante `2026-10-01T02:00:00Z` → "30 de septiembre" (zona, no UTC).
- `formatWeightKg`: 62,4 → "62,4 kg"; 62 → "62 kg"; 62,45 → "62,5 kg". `formatHeightMeters`: 132 →
  "1,32 m"; 165,5 → "1,66 m"; 100 → "1,00 m".
- `portalWeightSummary`: [] y solo nulls → null; un peso hace 21 días → `latestAgoText` "Último registro:
  hace 3 semanas", `changeText` null; 64,4 (3/8) → 62,4 (16/9) → "2 kg menos que el 3 de agosto";
  61,2 → 62,4 → "1,2 kg más que el …"; iguales → "Igual que el …"; desordenados → mismo resultado;
  `hideChange: true` → `changeText` null y el resto igual; ignora los puntos sin peso al buscar el
  anterior; con un peso de otro año → la fecha lleva el año.
- `portalHeightSummary`: sin alturas → null; toma la más reciente aunque venga desordenada; "Medida hoy"
  y "Medida hace 2 meses".
- `portalEvolutionRows`: saca las filas sin peso ni altura (D5); deja las que tienen solo altura;
  ordena de la más nueva a la más vieja; `weightText`/`heightText` null cuando falta; el objeto de
  salida tiene **exactamente** `id`, `dateLabel`, `weightText` y `heightText` (`Object.keys`, D2).
- `PORTAL_TEXT`: ningún valor contiene "sesión", "token", "inválido", "kcal", "macros" ni "registro
  guardado" (recorre `Object.values`).

**`apps/web/src/components/portal/portal-access.test.tsx`** (`renderToStaticMarkup` en node, como
`modal-scrim.test.tsx`), solo sobre `PortalAccessScreen`, que no usa hooks de Next:
- `variant="expired"` → contiene "Este link ya venció" y "cada link dura 15 minutos", y **no** contiene
  "Para entrar necesitás un link".
- `variant="no-link"` → contiene "Para entrar necesitás un link".
- Con `whatsappUrl="https://wa.me/5493515552345"` → `href="https://wa.me/5493515552345"`,
  `target="_blank"`, `rel="noopener noreferrer"`. Sin `whatsappUrl` → no hay `wa.me`.
- El `h1` tiene `id="portal-access-title"` (id fijo, T9e).

## 10-1. Verificación (antes de declararse `done`)

### 10.1 Comandos (desde la raíz)

```bash
npm run db:generate
npm run typecheck                     # core, db, web y bot en verde (core cambió)
npm run test                          # vitest de todo el monorepo (sin base ni red)
npm run lint --workspace apps/web     # sin warnings nuevos (el de ajustes/logo-form.tsx es previo)
./ops/harness/verify.sh               # "Arnés OK"
```

**Builds (webpack y Turbopack) en una copia**, nunca en `apps/web/.next` si el usuario tiene `next dev`
levantado:

```bash
SCR=<scratchpad>/build-017d1 && rm -rf "$SCR" && mkdir -p "$SCR"
rsync -a --exclude node_modules --exclude .next --exclude .git ./ "$SCR/"
cp -c -R node_modules "$SCR/node_modules"
cp -c -R apps/web/node_modules "$SCR/apps/web/node_modules" 2>/dev/null || true
cp .env "$SCR/.env"
cd "$SCR" && npm run build --workspace apps/web          # next build (webpack): exit 0
cd "$SCR/apps/web" && npx next build --turbopack         # "Compiled successfully", exit 0
```

Ninguno de los dos puede mostrar "useSearchParams() should be wrapped in a suspense boundary" (el gate
va en `Suspense`) ni "Only async functions are allowed to be exported in a "use server" file".

**Runtime con `next start`** (sobre el build de webpack de la copia, en un puerto libre):

```bash
PORT=3198; lsof -iTCP:$PORT -sTCP:LISTEN && echo "ocupado: elegir otro"   # tiene que no imprimir nada
cd "$SCR/apps/web" && npx next start -p $PORT     # en segundo plano, log a $SCR/start.log
```

Con Chromium headless (`playwright-core` instalado en el scratchpad con `npm i --prefix <scratchpad>/pw playwright-core`,
navegadores del caché `~/Library/Caches/ms-playwright`), viewport 390×844 con `isMobile` y `hasTouch`, y
1366×768:

- **Sin cookie:** `GET /portal` → "Para entrar necesitás un link". `GET /portal/login?token=basura` →
  termina en `/portal?error=invalid` con "Este link ya venció" y **sin** "Para entrar necesitás".
  `GET /portal/login?token=<token vencido>` (10.3, paso 1) → lo mismo.
- **Con token válido** de la paciente de prueba (10.3) → `/portal/login?token=…` → inicio:
  "Hola, Prueba 👋", "Tu espacio con tu nutricionista" (en dev la profesional es el seed, Q1), tarjeta
  del turno "Mañana, 10:00" con "Falta pagar la seña para confirmarlo" (turno B, 10.3) y tarjetas de
  plan y evolución que son `<a>`. `document.querySelector('header form[action="/portal/logout"]')` da
  null. "Salir del portal" → diálogo "¿Salir del portal?" → "Cancelar" (sigue adentro); otra vez →
  "Salir" → pantalla "Para entrar necesitás un link" y la cookie `patient_session` vacía.
- `/portal/evolucion` con la paciente de prueba: "28,4 kg", "Último registro: hace 3 semanas" y "1,30 m"; **no** aparece el texto de la nota de prueba
  (`"NOTA-CLINICA-017d"`), ni en el DOM ni en el HTML de la respuesta (`await res.text()` no la
  contiene: D2 también en el payload); no hay fila para la medición sin peso ni altura; la paciente
  es menor (10.3) → no hay "menos que"/"más que".
- **Log del servidor:** sin "cannot be passed to Client Components", sin "Functions cannot be passed",
  sin errores.
- **Consola del navegador:** sin errores de JS y **sin avisos de hidratación** a 390 y a 1366 px, en
  10 recargas seguidas de `/portal` y de `/portal?error=invalid` sin cookie (T9e).
- Sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`) a 390, 768 y 1366.
- Matar el `next start` y borrar la copia y `playwright-core` del scratchpad al terminar.

### 10.2 Alcance del diff

Base: `13c1d80` (la punta de la rama cuando se escribió esta SDD). Los commits del orquestador posteriores
(`backlog/`, `progress/`, `docs/`, `Refactorizaciones/`) pueden aparecer en el diff; lo que se mira es que el
implementer no haya tocado nada fuera de 7.2: con `git log 13c1d80..HEAD --author` o filtrando sus commits.

```bash
git diff 13c1d80 --stat                                                        # solo archivos de 7.2
git diff 13c1d80 --name-only | grep -E 'app/\(panel\)/(alimentos|plantillas)/|pacientes/\[id\]/planes/|components/(food-picker|meals-editor|macro-totals)\.tsx|lib/(meal-view|plan-pdf)\.tsx?$'   # → vacío
git diff 13c1d80 --name-only | grep -E '^(apps/bot|packages/db)/'   # → vacío
git diff 13c1d80 --name-only | grep -E 'portal/plan/|components/(recipes|recipe-picker|weekly-menu)/|lib/portal-recipe'   # → vacío (T11)
git diff 13c1d80 -- packages/core/src/messages.ts                              # → vacío (T4)
git diff 13c1d80 -- packages/core/src/index.ts | grep '^+' | grep -v '^+++'   # → solo `export * from "./portal";`, al final
```

### 10.3 Datos de prueba y recorrido (orquestador, Chrome a 390 px)

**Precondición dura: el bot apagado** (`pgrep -fl "apps/bot|dev:bot"` → vacío). El turno con seña
lo vencería el cron y encolaría un mensaje al JID de prueba.

**Token (no escribe nada en la base).** Desde `packages/db`, con el `.env` de la raíz:

```bash
cd packages/db && npx dotenv -e ../../.env -- npx tsx -e \
  "import { createPatientToken } from './domain/patientAuth'; console.log(createPatientToken(process.argv[1], 15))" hu017d-paciente
# vencido: mismo comando con -1 en lugar de 15
```

Para entrar como una paciente real (solo mirar), mismo comando con su id. **No** se toca nada con esa
sesión: el recorrido sobre ella es de inicio, plan y evolución.

**Paciente de prueba (se crea y se borra por id; JID inventado).**

```bash
# 0) Conteos de antes (se comparan al final):
docker compose exec -T db psql -U nutri -d nutribot -At -c "select (select count(*) from \"Patient\"), (select count(*) from \"Appointment\"), (select count(*) from \"EvolutionEntry\"), (select count(*) from \"DiaryEntry\"), (select count(*) from \"OutboundMessage\");"
# 1) El id y el JID no existen (tiene que dar 0):
docker compose exec -T db psql -U nutri -d nutribot -At -c "select count(*) from \"Patient\" where id='hu017d-paciente' or \"whatsappJid\"='5493510017401@s.whatsapp.net';"
# 2) Paciente (menor: 8 años) y tres mediciones (una con nota, una sin peso ni altura):
docker compose exec -T db psql -U nutri -d nutribot -c "
insert into \"Patient\" (id, \"whatsappJid\", phone, name, \"birthDate\", \"createdAt\", \"updatedAt\")
values ('hu017d-paciente', '5493510017401@s.whatsapp.net', '5493510017401', 'Prueba Portal 017d', '2018-05-10', now(), now());
insert into \"EvolutionEntry\" (id, \"patientId\", \"recordedAt\", \"weightKg\", \"heightCm\", note, \"createdAt\") values
 ('hu017d-ev-1', 'hu017d-paciente', now() - interval '60 days', 27.1, 128, null, now()),
 ('hu017d-ev-2', 'hu017d-paciente', now() - interval '21 days', 28.4, 130, 'NOTA-CLINICA-017d', now()),
 ('hu017d-ev-3', 'hu017d-paciente', now() - interval '10 days', null, null, null, now());"
# 3) Turnos de mañana: A CONFIRMED 11:30 y B AWAITING_PAYMENT 10:00 (el de seña va primero: D6).
#    needsGoogleSync=false y confirmationRequestedAt=now() para que no los tome ningún cron.
docker compose exec -T db psql -U nutri -d nutribot -c "
with s as (select id, price, \"durationMin\" from \"Service\" where active order by name limit 1),
d as (select date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires') + interval '1 day' as dia)
insert into \"Appointment\" (id, \"patientId\", \"serviceId\", \"startsAt\", \"endsAt\", status, \"createdBy\", \"priceSnapshot\", \"needsGoogleSync\", \"confirmationRequestedAt\", \"createdAt\", \"updatedAt\")
select v.id, 'hu017d-paciente', s.id,
  ((d.dia + v.h) at time zone 'America/Argentina/Buenos_Aires') at time zone 'UTC',
  ((d.dia + v.h + make_interval(mins => s.\"durationMin\")) at time zone 'America/Argentina/Buenos_Aires') at time zone 'UTC',
  v.st::\"AppointmentStatus\", 'PROFESSIONAL', s.price, false, now(), now(), now()
from s, d, (values ('hu017d-turno-a', interval '11 hours 30 minutes', 'CONFIRMED'),
                   ('hu017d-turno-b', interval '10 hours', 'AWAITING_PAYMENT')) as v(id, h, st);"
# 4) Limpieza (SOLO por id; sumar los ids de DiaryEntry que cree la UI en 017d-2):
docker compose exec -T db psql -U nutri -d nutribot -c "
delete from \"OutboundMessage\" where \"appointmentId\" in ('hu017d-turno-a','hu017d-turno-b');
delete from \"Payment\"         where \"appointmentId\" in ('hu017d-turno-a','hu017d-turno-b');
delete from \"Appointment\"     where id in ('hu017d-turno-a','hu017d-turno-b');
delete from \"EvolutionEntry\"  where id in ('hu017d-ev-1','hu017d-ev-2','hu017d-ev-3');
delete from \"DiaryEntry\"      where id in (/* ids anotados en 017d-2 */ '');
delete from \"Patient\"         where id = 'hu017d-paciente';"
```

Si hay que verificar el saludo de un adulto o el texto del cambio de peso, se hace con un
`update "Patient" set "birthDate" = '1990-01-01' where id = 'hu017d-paciente'`, solo sobre la paciente
de prueba. Antes del bloque 4, `select count(*) from "OutboundMessage" where "appointmentId" in
('hu017d-turno-a','hu017d-turno-b')` tiene que dar 0. Si no da 0, el bot estaba prendido: borrar
esas filas por id y avisar.

**Pasos del recorrido** (390×844 con emulación táctil, después 768×1024 y 1366×768):
1. Link basura y link vencido → "Este link ya venció". `/portal` sin cookie → "Para entrar necesitás un
   link". Sin botón de WhatsApp (en dev `phoneJid` es null).
2. Link válido → inicio: saludo grande con el nombre de pila, "Tu espacio con tu nutricionista", turno
   B destacado "Mañana, 10:00" + "Falta pagar la seña para confirmarlo" + servicio y precio, sin botón de
   pago. Tocar la tarjeta del plan en cualquier punto → responde al toque (escala y tono) y navega;
   igual la de evolución. "Anotar comida" → `/portal/diario`.
3. El header no tiene "Salir". "Salir del portal" al final → confirmación → "Cancelar" → sigue →
   "Salir" → pantalla sin link.
4. Evolución: "28,4 kg", "Último registro: hace 3 semanas", "1,30 m" con "Medida hace 3 semanas", sin
   texto de cambio (menor), gráfico con 2 barras, historial con 2 filas y sin la nota.
5. Con movimiento reducido (emulación `prefers-reduced-motion`), el gráfico aparece sin crecer.
6. **D20:** a 390 px con el brillo bajo, ¿las tarjetas blancas se distinguen del fondo `#FBFAF7`? Si
   no, anotar en `progress/recorrido_HU-017d.md` y sumar `ring-1 ring-black/[0.04]` **solo** a las
   tarjetas del portal (`PortalCardLink` y las `Card` del portal vía `className`), sin tocar los
   tokens.
7. Una paciente real (solo mirar): inicio y evolución con sus datos, sin notas en el historial.
8. Limpieza (bloque 4) y repetir el paso 0 → mismos conteos.

**D19 (pendiente del usuario):** las tareas (1) "decir cuándo es el próximo turno" y, en 017d-3, (2) y
(3), en un celular real, como si fuera la mamá de una paciente de 8 años. Se anotan las dudas en
`progress/recorrido_HU-017d.md`.

## 11-1. Restricciones para el implementer

- **Datos de la base de desarrollo, regla dura (AGENTS.md):** ninguna verificación borra ni modifica
  datos de negocio preexistentes. Una prueba que escribe limpia **solo por los ids que ella misma
  insertó**, nunca con un filtro amplio (`deleteMany({ where: { patientId } })` se lleva todo). Los
  tests de vitest usan mocks. No correr `db:seed`/`seed:demo`. Nada de `prisma migrate`.
- **WhatsApp, nunca mensajes reales (AGENTS.md):** el runtime con turnos corre con el bot apagado. No
  se toca el botón "Escribir por WhatsApp" (solo se mira el `href`). No se abre WhatsApp Web.
- No tocar la zona de imleticio (T6), `apps/bot/**`, `packages/db/**`, `backlog/**`, ni los archivos de
  plan/recetas de T11.
- No cambiar firmas existentes (T5). T9 completo.
- No correr `next build` en `apps/web/.next` con el `next dev` del usuario levantado.

---

# Entrega 017d-2: diario

## 1-2. Resumen funcional

"Tu diario" pasa a ser como una app. "Anotar comida" abre un sheet desde abajo con agarre. El sheet se
cierra arrastrando, tocando afuera o con la X, y pregunta "¿Descartar lo que anotaste?" si hay algo
escrito. Tiene el campo "¿Qué comiste?" a 17 px y los botones "Sacar foto" (cámara) y "Elegir de la
galería", con miniatura y "Quitar foto". La foto se achica en el celular antes de subirla (D10), así
que una foto de cámara de 5 MB se guarda sin error. "Guardar" muestra "Guardando…", cierra el sheet,
avisa "¡Listo! Ya lo anotaste." y el registro entra arriba de la lista con una transición. La lista se
agrupa por día ("Hoy", "Ayer", "Jueves 2 de octubre"), con la hora, el texto y una miniatura que abre
la foto grande en otro sheet. "Borrar" saca el registro al instante con "Deshacer" de 8 s (D11). El
inicio abre el sheet directo con `/portal/diario?anotar=1`. La lista ya no trae los bytes de las
fotos.

## 2-2. Workspaces afectados

| Workspace | ¿Cambia? | Qué |
|---|---|---|
| `packages/core` | **sí** | `portal.ts`: `groupDiaryByDay` + textos del diario (`PORTAL_DIARY_TEXT`) |
| `packages/db` | no | La lista va con `select` en la página (Q6) |
| `apps/web` | **sí** | `portal/diario/**`, `components/portal/diary-*`, `lib/photo-resize.ts`, `lib/use-keyboard-inset.ts`, `components/primitives/sheet.tsx` (Q4), `(portal)/layout.tsx` (`PendingUnloadGuard`), `portal/page.tsx` (link `?anotar=1`) |
| `apps/bot` | no | `typecheck` igual |

## 3-2. Esquema

Sin cambios. `DiaryEntry` se escribe como hoy (`note`, `photoData`, `photoMimeType`). La foto llega
achicada: siempre `image/jpeg` cuando se achica, y conserva PNG/WEBP si ya era chica y de un tipo
permitido (4.3).

## 4-2. Contrato

### 4.1 core (`portal.ts`, agregados)

```ts
export const PORTAL_DIARY_TEXT = {
  title: "Tu diario",
  subtitle: "Anotá lo que comés, con foto si querés. Tu nutricionista lo ve.",
  addMeal: "Anotar comida",
  sheetTitle: "Anotar comida",
  noteLabel: "¿Qué comiste?",
  notePlaceholder: "Ej: almuerzo, milanesa con ensalada y una fruta",
  takePhoto: "Sacar foto",
  pickFromGallery: "Elegir de la galería",
  pickPhoto: "Elegir foto",            // ≥ 768 px
  preparingPhoto: "Preparando la foto…",
  removePhoto: "Quitar foto",
  save: "Guardar",
  saving: "Guardando…",
  saved: "¡Listo! Ya lo anotaste.",
  errorEmpty: "Escribí qué comiste o agregá una foto.",
  errorPhoto: "Esa foto no se puede usar. Probá con otra.",
  errorSave: "No se pudo guardar. Probá de nuevo.",
  errorNoAccess: "Tu link venció. Escribí portal por WhatsApp y te mandamos uno nuevo.",
  discardTitle: "¿Descartar lo que anotaste?",
  discardBody: "Lo que escribiste y la foto no se guardan.",
  discardConfirm: "Descartar",
  discardCancel: "Seguir anotando",
  deleteLabel: "Borrar",
  deleted: "Borraste el registro.",
  undone: "Listo, el registro volvió.",
  deleteError: "No se pudo borrar. Probá de nuevo.",
  photoAlt: "Foto de la comida",
  photoSheetTitle: "Foto de la comida",
  emptyTitle: "Todavía no anotaste nada",
} as const;

export interface DiaryDayGroup<T> {
  /** "yyyy-MM-dd" en tz */
  dayKey: string;
  /** "Hoy" | "Ayer" | "Jueves 2 de octubre" | "Jueves 2 de octubre de 2025" */
  label: string;
  entries: (T & { timeLabel: string })[]; // timeLabel "13:40" ("H:mm", formatInTimeZone)
}
/** Agrupa por día calendario en tz. Grupos del día más nuevo al más viejo; dentro, por createdAt desc. */
export function groupDiaryByDay<T extends { createdAt: Date }>(
  entries: readonly T[], now: Date, tz: string,
): DiaryDayGroup<T>[];
```

### 4.2 Página (`portal/diario/page.tsx`, servidor)

```ts
export default async function PortalDiaryPage({ searchParams }: { searchParams: Promise<{ anotar?: string }> })
const [pro, rows] = await Promise.all([getProfessional(), prisma.diaryEntry.findMany({
  where: { patientId: patient.id }, orderBy: { createdAt: "desc" },
  select: { id: true, note: true, createdAt: true, photoMimeType: true }, // sin photoData (Q6)
})]);
const groups = groupDiaryByDay(rows, new Date(), pro.timezone).map((g) => ({
  dayKey: g.dayKey, label: g.label,
  entries: g.entries.map((e) => ({ id: e.id, note: e.note, hasPhoto: e.photoMimeType !== null, timeLabel: e.timeLabel })),
}));
// → <DiaryScreen groups={groups} openOnMount={(await searchParams).anotar === "1"} />
```

`hasPhoto` se apoya en `photoMimeType`, que `addDiaryEntry` siempre escribe junto con `photoData`. La
ruta de la foto sigue chequeando los dos (`photo/[id]/route.ts:14`), así que un dato viejo
inconsistente da 404 y el `<img>` muestra el `onError` (4.5).

### 4.3 `apps/web/src/lib/photo-resize.ts` (nuevo, cliente; la parte pura con test)

```ts
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;        // igual al límite del servidor
export const PHOTO_TARGET_BYTES = 2.5 * 1024 * 1024;   // margen
export const PHOTO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Escala para que el lado mayor sea ≤ maxSide, sin agrandar; redondea a enteros ≥ 1. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number };

/** No hace falta re-codificar si el tipo es permitido, pesa ≤ PHOTO_TARGET_BYTES y el lado mayor ≤ maxSide. */
export function canUploadAsIs(file: { type: string; size: number }, dims: { width: number; height: number }): boolean;

/** Intentos en orden hasta quedar ≤ PHOTO_TARGET_BYTES: [1600 px, q 0.82], [1600, 0.7], [1280, 0.7], [1024, 0.6]. */
export const PHOTO_ATTEMPTS: readonly { maxSide: number; quality: number }[];

export type ResizeResult =
  | { ok: true; file: File }               // "foto.jpg" (o el original si canUploadAsIs)
  | { ok: false; reason: "unreadable" | "too_large" };

/** Decodifica con createImageBitmap(file, { imageOrientation: "from-image" }) (respeta EXIF); si no
 *  existe o falla, con <img> + decode() (los navegadores aplican EXIF en <img>). Dibuja en un canvas
 *  con el tamaño de fitWithin, toBlob("image/jpeg", q). HEIC en un navegador que no lo decodifica →
 *  "unreadable". Nunca tira. */
export async function resizePhotoForUpload(file: File): Promise<ResizeResult>;
```

### 4.4 Actions (`portal/diario/actions.ts`, `"use server"`)

```ts
export type DiaryState = { ok: boolean; error?: string };           // igual que hoy
export type DiaryDeleteResult = { ok: boolean; error?: string };    // compatible con CommitResult

export async function addDiaryEntryAction(_prev: DiaryState, formData: FormData): Promise<DiaryState>;
export async function deleteDiaryEntryAction(id: string): Promise<DiaryDeleteResult>;   // cambia la firma (Q7)
```

- `addDiaryEntryAction` hace lo mismo que hoy (tipo permitido, ≤ 3 MB, texto o foto) y solo cambian
  los textos y la revalidación:
  - Sin paciente → `errorNoAccess`.
  - Tipo no permitido o > 3 MB → `errorPhoto`.
  - Vacío → `errorEmpty`.
  - Si `addDiaryEntry` tira → `{ ok: false, error: errorSave }`, con `try/catch` y sin relanzar.
  - Al guardar bien: `revalidatePath("/portal/diario")` **y** `revalidatePath("/portal")` (el conteo
    del inicio).
- `deleteDiaryEntryAction(id)`:
  - Sin paciente → `{ ok: false, error: errorNoAccess }`.
  - `id` vacío → `{ ok: false }`.
  - El registro no existe → `{ ok: true }`: ya no está, y así el borrado es idempotente (T9d).
  - Es de otra paciente → `{ ok: false, error: deleteError }`, sin borrar.
  - Si no, `deleteDiaryEntry(id)` dentro de un `try/catch` (si tira, `ok: false`), las dos
    revalidaciones y `{ ok: true }`.
- No hay re-exports de tipos (T9c). El único consumidor de las dos actions es `components/portal/diary-*`.
  `DiaryForm` (`diary-form.tsx`) se borra: su único uso es la página de hoy. El prop `submitAction`
  "para la página de prueba" no tiene consumidores (`grep -rn DiaryForm apps` → solo la página).

### 4.5 Componentes cliente (`apps/web/src/components/portal/`)

```tsx
// diary-screen.tsx ("use client"): botón "Anotar comida", sheet, lista. Recibe solo datos planos.
export type DiaryEntryRow = { id: string; note: string | null; hasPhoto: boolean; timeLabel: string };
export type DiaryGroupRow = { dayKey: string; label: string; entries: DiaryEntryRow[] };
export function DiaryScreen(props: { groups: DiaryGroupRow[]; openOnMount: boolean }): JSX.Element;

// diary-entry-sheet.tsx ("use client")
export function DiaryEntrySheet(props: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element;

// diary-list.tsx ("use client")
export function DiaryList(props: { groups: DiaryGroupRow[] }): JSX.Element;

// diary-photo-sheet.tsx ("use client")
export function DiaryPhotoSheet(props: { entryId: string | null; title: string; onOpenChange: (open: boolean) => void }): JSX.Element;
```

- **`DiaryScreen`:**
  - Si `openOnMount`, en un `useEffect` (una vez): `setOpen(true)` y `replaceUrlInRouter("/portal/diario")`
    (T9b), así recargar no reabre el sheet.
  - Botón `primary lg w-full` "Anotar comida" con `PenLine`, que es el disparador. Al abrir se guarda
    el elemento con foco para devolvérselo al cerrar (lo hace Radix con `SheetTrigger`; con `open`
    controlado se usa `SheetTrigger asChild` igual, como `ServiceSheet` + botón).
  - Sin registros (después de filtrar los pendientes de borrar): `EmptyState` con `emptyTitle` y la
    acción "Anotar comida".
- **`DiaryEntrySheet`** (patrón `ServiceSheet` de 017b):
  - `compact = useMediaQuery("(max-width: 767px)")` decide `side={compact ? "bottom" : "right"}`
    (D12). `className` lleva `cn("theme-portal", compact ? "" : "w-full sm:max-w-md")`.
  - Si hay `keyboardInset > 0` (Q5), `style={{ bottom: keyboardInset }}`.
  - `onOpenAutoFocus`: en `compact`, `preventDefault` y foco al `SheetTitle` (`tabIndex={-1}`, ref),
    para que el teclado no se abra solo. En escritorio, foco al textarea.
  - Estado: `note`, `photo: { file: File; previewUrl: string } | null`, `preparing`, `error`, y
    `pending` de `useTransition`. `dirty = note.trim() !== "" || photo !== null`.
  - `useUnsavedChangesGuard(open && dirty, { title: discardTitle, description: discardBody, confirmLabel: discardConfirm, cancelLabel: discardCancel })`.
  - `requestOpenChange(next)` es el mismo que en `ServiceSheet`: con `dirty`, pregunta antes de cerrar
    por X, Esc, toque afuera o arrastre. Mientras `pending`, no se cierra.
  - Al cerrar sin guardar: se limpian `note`, `photo` (`URL.revokeObjectURL`) y `error`. Con
    `key={openCount}` el formulario se remonta en cada apertura.
  - Campo: `Field label="¿Qué comiste?"` + `Textarea rows={3}` con `placeholder` y `aria-describedby` al
    error.
  - Foto: dos `<input type="file" accept="image/*" hidden>`, uno con `capture="environment"`.
    - En `compact`: dos `Button variant="tinted" size="lg"` lado a lado (`grid grid-cols-2 gap-3`),
      "Sacar foto" (`Camera`) y "Elegir de la galería" (`ImageIcon`), que hacen `.click()` en su
      input. En escritorio, un solo botón "Elegir foto" (sin `capture`).
    - Al elegir: `preparing = true` → `resizePhotoForUpload(file)` → `ok` → `previewUrl =
      URL.createObjectURL(result.file)`. Si falla → `error = errorPhoto`. Después se limpia
      `input.value`, así elegir la misma foto otra vez dispara `change`.
    - Con foto: miniatura `<img>` de 96 px con `rounded-xl object-cover` y `alt` = `photoAlt`, más el
      `Button variant="plain" size="lg"` "Quitar foto" (`X`).
  - "Guardar": `Button primary lg w-full` con `loading={pending}`; el texto pasa a "Guardando…" y queda
    `disabled` mientras `pending || preparing`.
    - Validación local: sin texto ni foto → `error = errorEmpty` y no se manda nada.
    - Si no:
      `startTransition(async () => { try { const fd = new FormData(); fd.set("note", note); if (photo) fd.set("photo", photo.file); const r = await addDiaryEntryAction({ ok: false }, fd); if (r.ok) { notify.saved(PORTAL_DIARY_TEXT.saved); close sin preguntar } else setError(r.error ?? errorSave); } catch { setError(errorSave); } })`.
    - **No** se usa `useActionState`: un error de red ahí sube al error boundary y perdería lo
      escrito. Con el `try/catch` el texto y la foto quedan (escenario "Error al guardar").
  - Error: `<p id role="alert" className="text-callout text-destructive">` debajo del campo.
- **`DiaryList`:**
  - `pending = usePendingDeletions()`. Se filtran las entradas cuya key `diary:<id>` está en
    `pending`, y los grupos que quedan vacíos no se dibujan.
  - Por grupo: `<section aria-labelledby={"diario-dia-" + dayKey}>` con `h2` (`text-subheadline
    font-semibold text-muted-foreground px-4`) y una lista agrupada (`ul rounded-xl bg-card
    shadow-card`).
  - Ítems en `<AnimatePresence initial={false}>` con `<m.li layout key={id} initial={{ opacity: 0, y: -8 }}
    animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={springs.standard}>`. Al cargar
    la página nada se anima; el registro nuevo, que llega con la revalidación, entra con la
    transición. Con movimiento reducido queda solo el fundido (`MotionConfig`).
  - Fila: arriba, la hora `timeLabel` (`text-subheadline text-muted-foreground tabular-nums`) y a la
    derecha "Borrar" (`Button variant="plain" size="lg" className="text-destructive"`, `Trash2`,
    `aria-label={"Borrar el registro de las " + timeLabel}`). Debajo, el `note` (`text-body-lg
    whitespace-pre-wrap break-words`) y, si `hasPhoto`, un botón miniatura de 64 px (`<img
    loading="lazy" src={"/portal/diario/photo/" + id}>`, `rounded-lg object-cover`, `aria-label="Ver
    la foto en grande"`) que abre `DiaryPhotoSheet`. Si el `<img>` da error, se cambia por un
    recuadro gris con `ImageOff`.
  - "Borrar" → `deferredDelete({ key: "diary:" + id, message: deleted, undoneMessage: undone, commit: () => deleteDiaryEntryAction(id), guardUnload: true, errorMessage: deleteError })`.
    Si devuelve `false` (ya pendiente), no se hace nada (T9d). Después de programarlo, el foco pasa
    al `h1` de la página (`id="portal-diary-title"`, `tabIndex={-1}`), porque la fila desaparece.
- **`DiaryPhotoSheet`:**
  - `Sheet` con `open={entryId !== null}` y `side="bottom"` en `compact` o `"right"` en escritorio.
  - `className="theme-portal"`. El `SheetHeader` lleva el `SheetTitle` `photoSheetTitle` + la hora
    en `SheetDescription`, y debajo el `<img src=… className="w-full rounded-xl object-contain
    max-h-[70dvh]">`.

### 4.6 `components/primitives/sheet.tsx` (Q4, sin cambiar la API)

En `SheetPanel`, `onDismiss` hace lo de hoy (`exitVelocity.current = velocity; setOpen(false)`) y suma
esto: en el próximo cuadro (`requestAnimationFrame`), si el panel sigue presente (`isPresentRef.current`,
un ref que se actualiza con `isPresent`), `exitVelocity.current = null` y
`animateSingleValue(offset, 0, reduced ? fades.fast : springs.standard)`. Es decir: si el dueño vetó
el cierre, el panel vuelve a su lugar. Sin veto, el panel deja de estar presente y la salida sigue
como hoy. Esto también arregla el caso de `ServiceSheet` (017b-2).

### 4.7 `apps/web/src/lib/use-keyboard-inset.ts` (Q5, nuevo, cliente)

```ts
/** Alto del teclado en pantalla (px) según visualViewport: max(0, innerHeight − vv.height − vv.offsetTop).
 *  0 si no hay visualViewport o si !enabled. Escucha resize/scroll de visualViewport. */
export function useKeyboardInset(enabled: boolean): number;
/** Puro, con test. */
export function keyboardInsetFrom(innerHeight: number, vv: { height: number; offsetTop: number } | null): number;
```

Solo lo usa `DiaryEntrySheet` en `compact`.

### 4.8 Otros cambios

- `(portal)/layout.tsx`: `<PendingUnloadGuard />` dentro del `ConfirmProvider`, con paciente.
- `portal/page.tsx`: el botón "Anotar comida" de la tarjeta del diario pasa a `href="/portal/diario?anotar=1"`.

### 4.9 Rutas y mensajes del bot

`/portal/diario` (con `?anotar=1` opcional). Las actions cambian como dice 4.4. `photo/[id]` no
cambia. El bot no cambia.

## 6-2. Pantallas (skill `ui`)

| Vista | Estructura base | Componentes clave |
|---|---|---|
| Tu diario | Shell del portal; `h1` "Tu diario" + subtítulo | Botón lleno "Anotar comida"; grupos por día (encabezado + lista agrupada); fila con hora, "Borrar" rojo `plain`, texto y miniatura de 64 px; `EmptyState`; toast "Deshacer" |
| Anotar comida | `Sheet` inferior con agarre (derecha desde 768 px), fondo oscurecido sin achicarse | `SheetTitle`; `Textarea` de 17 px; dos botones `tinted` (cámara/galería) o uno ("Elegir foto"); miniatura de 96 px + "Quitar foto"; "Guardar" lleno; error inline; `AlertDialog` "¿Descartar lo que anotaste?" |
| Foto grande | `Sheet` inferior con agarre | Título + hora, imagen a lo ancho, X |

## 7-2. Archivos

| Archivo | Acción |
|---|---|
| `packages/core/src/portal.ts` / `portal.test.ts` | `PORTAL_DIARY_TEXT`, `groupDiaryByDay` + tests |
| `apps/web/src/lib/photo-resize.ts` + `photo-resize.test.ts` | nuevos |
| `apps/web/src/lib/use-keyboard-inset.ts` + `use-keyboard-inset.test.ts` | nuevos |
| `apps/web/src/components/primitives/sheet.tsx` | vuelve a su lugar si se veta el cierre (4.6) |
| `apps/web/src/app/(portal)/portal/diario/actions.ts` + `actions.test.ts` | textos, revalidación, `deleteDiaryEntryAction(id)` |
| `apps/web/src/app/(portal)/portal/diario/page.tsx` | `select` sin bytes, grupos, `DiaryScreen` |
| `apps/web/src/app/(portal)/portal/diario/diary-form.tsx` | se borra |
| `apps/web/src/components/portal/diary-screen.tsx`, `diary-entry-sheet.tsx`, `diary-list.tsx`, `diary-photo-sheet.tsx` | nuevos |
| `apps/web/src/app/(portal)/layout.tsx` | `PendingUnloadGuard` |
| `apps/web/src/app/(portal)/portal/page.tsx` | `href="/portal/diario?anotar=1"` |

## 8-2. Checklist (un commit por fase; rama `feat/hu-017d2-diario` desde la punta de 017d-1)

- **Fase 0 (sin commit):** `git switch -c feat/hu-017d2-diario` desde la punta aprobada de 017d-1.
  `db:generate`. Ver si hay un `next dev` corriendo. Capturas antes de `/portal/diario`.
- **Fase 1** (`HU-017d-2: agrupado del diario por día y textos (core)`): `PORTAL_DIARY_TEXT`,
  `groupDiaryByDay` y sus tests. `typecheck` de core y bot.
- **Fase 2** (`HU-017d-2: foto achicada en el celular y teclado en el sheet`): `photo-resize.ts`,
  `use-keyboard-inset.ts`, sus tests y el arreglo de `sheet.tsx` (4.6).
- **Fase 3** (`HU-017d-2: actions del diario en lenguaje simple y borrado idempotente`): `actions.ts` +
  `actions.test.ts`.
- **Fase 4** (`HU-017d-2: anotar comida en un sheet, lista por día y borrar con Deshacer`): los 4
  componentes, `page.tsx`, borrar `diary-form.tsx`, `layout.tsx` (`PendingUnloadGuard`) y el link del
  inicio. `typecheck` de los 4 workspaces.
- **Fase 5** (`HU-017d-2: implementación y verificación`, solo `progress/impl_HU-017d.md`): 10-2.

## 9-2. Tests

- **core `groupDiaryByDay`** (`now` = martes 7/10/2026 12:00 en Argentina):
  - Registros de hoy, de ayer y del 2/10 → labels "Hoy", "Ayer", "Jueves 2 de octubre".
  - Uno de 2025 → "… de 2025".
  - Un registro a las `2026-10-07T02:30Z` (6/10 23:30 en Argentina) cae en "Ayer".
  - Orden de grupos y de entradas desc con entrada desordenada; `timeLabel` "9:05" y "13:40".
  - Conserva los campos extra de `T`. [] → [].
- **`photo-resize.test.ts`** (solo lo puro):
  - `fitWithin`: 4032×3024 con 1600 → 1600×1200; 3024×4032 → 1200×1600; 800×600 → igual (no agranda);
    1×10000 → 1×1600 (mínimo 1).
  - `canUploadAsIs`: jpeg de 1 MB a 1200 px → true; jpeg de 2,6 MB → false; `image/heic` → false;
    png de 2000 px → false.
  - `PHOTO_ATTEMPTS`: el primero es 1600/0.82 y la calidad nunca sube.
- **`use-keyboard-inset.test.ts`:** `keyboardInsetFrom(844, { height: 500, offsetTop: 0 })` → 344;
  `null` → 0; un valor negativo da 0.
- **`actions.test.ts`** (mocks de `@/lib/patient-session`, `@nutri-bot/db`, `@nutri-bot/db/domain` y
  `next/cache`, como `recetas/fotos/[photoId]/route.test.ts`):
  - add: sin paciente → `errorNoAccess`.
  - add: vacío → `errorEmpty`.
  - add: `image/gif` → `errorPhoto`.
  - add: 3 MB + 1 → `errorPhoto`.
  - add: texto solo → `addDiaryEntry("pat1", { note, photoData: null, photoMimeType: null })` y
    `revalidatePath` con `/portal/diario` y `/portal`.
  - add: con foto jpeg → `photoMimeType: "image/jpeg"`.
  - add: `addDiaryEntry` tira → `{ ok: false, error: errorSave }`.
  - delete: no existe → `{ ok: true }` sin llamar a `deleteDiaryEntry`.
  - delete: de otra paciente → `{ ok: false }` sin borrar.
  - delete: propio → borra, revalida y `{ ok: true }`.
  - delete: `deleteDiaryEntry` tira → `{ ok: false }`.
  - delete: sin paciente → `{ ok: false }`.
  - Ningún `error` contiene "sesión" ni "inválido".

## 10-2. Verificación

- Los comandos de 10.1 (typecheck, test, lint, verify.sh, builds de webpack y Turbopack en una copia,
  `next start` en un puerto libre).
- **Runtime** con la paciente de prueba de 10.3 (bot apagado):
  - `/portal/diario?anotar=1` → el sheet abierto y la URL queda en `/portal/diario` sin cambiar
    `history.length`.
  - Guardar con una foto JPEG de 5 MB y 4032×3024 generada en el scratchpad (p. ej. con `sips` o un
    canvas de Playwright) → se guarda. `select length("photoData"), "photoMimeType" from "DiaryEntry"
    where id='<id>'` → < 3 MB y `image/jpeg`. **Anotar el id.**
  - Guardar sin nada → `errorEmpty` y el sheet abierto.
  - Con `context.setOffline(true)` → `errorSave`, y el texto y la miniatura siguen ahí.
  - Escribir y tocar afuera → "¿Descartar…?" → "Seguir anotando" → el sheet sigue en su lugar.
    Arrastrar desde el agarre con texto → misma pregunta, y con "Seguir anotando" el panel **vuelve
    arriba** (4.6).
  - Borrar → durante los 8 s, `select count(*) from "DiaryEntry" where id='<id>'` → 1. "Deshacer" → 1 y
    la fila vuelve. Otra vez y dejar vencer → 0. Doble toque rápido en "Borrar" → un solo toast.
    Recargar durante el plazo → aparece el diálogo `beforeunload`, y aceptarlo → el registro sigue.
  - El HTML de `/portal/diario` no trae bytes de fotos (el tamaño de la respuesta no crece con la
    foto).
  - Sin avisos de hidratación ni "cannot be passed".
- **Alcance:** `git diff <punta de 017d-1> --name-only` → solo 7-2. Las mismas exclusiones de 10.2 de
  017d-1.
- **Recorrido del orquestador (390 px y Safari de iOS o su simulador):**
  - Sin zoom en el campo.
  - "Guardar" visible con el teclado abierto (Q5).
  - Cámara y galería (si se puede en el simulador).
  - El arrastre sigue al dedo, se cierra con un movimiento rápido o pasada la mitad, y la página de
    atrás no scrollea.
  - El registro nuevo entra con transición; con movimiento reducido, solo fundido.
  - Teclado: abrir y cerrar con Esc; el foco vuelve a "Anotar comida"; "Deshacer" se alcanza.
  - D19 (3) "anotar la merienda con una foto" en un celular real.
  - Limpieza por id de los `DiaryEntry` anotados (bloque 4 de 10.3).
- **Ojo con `next start`:** la cookie `patient_session` es `Secure` con `NODE_ENV=production`. Chrome
  la acepta en `http://localhost`. Para Safari o el simulador, el recorrido va contra `next dev`, donde
  la cookie no es `Secure` (Q13).

---

# Entrega 017d-3: plan (con el merge de 018d)

## 1-3. Resumen funcional

El plan se lee fácil en el celular. No aparecen kcal ni macros en ninguna parte (D1), y la franja
`MacroTotals` desaparece en los dos modos. En el plan semanal, el selector marca "Hoy" bajo el día
actual, debajo va el nombre del día en grande y las comidas aparecen con un fundido corto al cambiar
de día. Cada comida es una tarjeta con su nombre; "Todos los días" va en texto y no como badge; las de
opciones dicen "Elegí una de estas opciones". En los alimentos, el nombre va a la izquierda (puede
bajar de renglón) y la cantidad a la derecha: "120 g", o "1½ tazas" con "270 g" chico y gris debajo
(018d). Las recetas son una fila entera tocable con "Ver receta ›" (D13) que abre un sheet inferior
con agarre (derecha desde 768 px) sin macros. "Descargar plan (PDF)" pasa a `tinted`. Si un día no
tiene comidas, lo dice en palabras simples.

## 2-3. Workspaces afectados

| Workspace | ¿Cambia por 017d? | Qué |
|---|---|---|
| `packages/core` | no | — (`recipePortionText`, `measureAmountText`, `formatGrams` y `RECIPE_PICKER_TEXT` vienen de 018 y no se tocan) |
| `packages/db` | **no por 017d** | El merge trae `schema.prisma` + `20261004174348_food_measures` + `domain/*` de 018 (ya aprobados y con la migración ya aplicada en dev) |
| `apps/web` | **sí** | `portal/plan/{page,plan-view,portal-day-view,portal-recipe-sheet}.tsx`, `components/weekly-menu/day-selector.tsx` (`today?`) |
| `apps/bot` | no | `typecheck` igual (el merge cambia `domain`, que el bot importa) |

## 3-3. Esquema

017d no lo cambia. El merge trae la migración de 018d, **que ya está aplicada en la base de dev**
(verificación del architect). No se corre ningún `prisma migrate`. Producción la aplicará con `migrate
deploy` cuando se publique 018d.

## 4-3. Contrato

### 4.1 `components/weekly-menu/day-selector.tsx` (prop opcional, T5/T6)

```ts
/** HU-017d-3: si viene, ese día muestra "Hoy" debajo de la abreviatura (text-caption) en lugar del
 *  punto de "sin cargar"; su aria-label pasa a "Martes, hoy" (o "Martes, hoy, sin cargar"). El editor
 *  no lo pasa: sin cambios. */
today?: Weekday;
```

### 4.2 `portal/plan/page.tsx` (después del merge)

- La consulta, `RECIPE_ITEM_SELECT`, `listPlanRecipePreviews`, `toPortalRecipeMap` y
  `portalMealsForClient` quedan **como vienen de 018d** (D14).
- Solo cambia lo que se le pasa a la vista: **no se pasan `totals` ni `dayTotals`** (Q10). `weekly` pasa
  a ser `{ today: Weekday; loadedDays: Weekday[] } | null`. `isWeekly` y `loadedDays` siguen saliendo
  de `computeWeeklyTotals(meals)` en el servidor. Si no hay plan: `EmptyState` con "Todavía no tenés un
  plan." y "Cuando tu nutricionista te lo comparta, lo vas a ver acá.".

### 4.3 `plan-view.tsx` (server-safe)

```ts
export function PortalPlanView(props: {
  title: string;
  notes: string | null;
  meals: MealView[];
  hasPdf: boolean;
  weekly?: { today: Weekday; loadedDays: Weekday[] } | null;
  recipes?: Record<string, PortalRecipeView>;
}): JSX.Element;   // sin `totals`; sin import de MacroTotals
```

- `h1 text-title-1` con el título del plan; `notes` en `text-body-lg text-muted-foreground`.
- PDF: `<a href="/portal/plan/pdf">` con `buttonVariants({ variant: "tinted", size: "lg" })`,
  `w-full sm:w-auto`, `FileDown` y el texto "Descargar plan (PDF)" (D16).
- Plan semanal → `PortalDayView`. Si no, las comidas en `PortalMealCard`.

### 4.4 `portal-day-view.tsx` (`"use client"`)

```ts
export function PortalMealItems(props: { items: MealItemView[]; recipes?: Record<string, PortalRecipeView> }): JSX.Element;
export function PortalMealCard(props: { meal: MealView; items: MealItemView[]; recipes?: Record<string, PortalRecipeView> }): JSX.Element;
export function PortalDayView(props: {
  meals: MealView[]; today: Weekday; loadedDays: Weekday[]; recipes?: Record<string, PortalRecipeView>;
}): JSX.Element;   // sin dayTotals; sin MacroTotals
```

- **`PortalDayView`:**
  - `DaySelector` recibe `today={today}`. Debajo, `h2 text-title-3` con
    `WEEKDAY_LABELS[day].long` ("Martes").
  - Las comidas del día van en `<m.div key={day} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    transition={fades.fast}>`.
  - Si el día no tiene comidas: `Card` con "El {WEEKDAY_LABELS[day].lower} no tiene comidas cargadas.
    Mirá otro día o preguntale a tu nutricionista."
- **`PortalMealCard`:** `Card` sin `title`. Arriba, `<div className="mb-3 flex flex-wrap items-baseline
  gap-x-2"><h3 className="text-headline">{meal.name}</h3>{meal.mode === "EVERY_DAY" ? <span
  className="text-subheadline text-muted-foreground">Todos los días</span> : null}</div>`. Si
  `meal.isOptions`: `<p className="mb-2 text-subheadline font-semibold text-muted-foreground">Elegí una
  de estas opciones</p>`.
- **Fila de alimento:** `li flex items-start justify-between gap-4 py-3`.
  - Izquierda: `span min-w-0 flex-1 break-words text-body-lg`.
  - Derecha: `span shrink-0 flex flex-col items-end text-right`. Con `item.measure`: `text-body-lg`
    `measureAmountText(item.measure.qty, item.measure)` y debajo `text-footnote tabular-nums
    text-muted-foreground` `formatGrams(Number(item.quantityGrams))`. Sin medida: `Quantity
    value={Number(item.quantityGrams)} unit="g" decimals={1} className="text-body-lg"` (D15, igual
    que hoy).
- **Fila de receta (D13):** `li` con `PortalRecipeSheet` (4.5), donde **la fila entera es el
  disparador**: `<SheetTrigger asChild><button className="-mx-2 flex min-h-16 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-3 text-left press-none pressed:bg-overlay-pressed transition-colors focus-visible:outline …">`.
  Adentro van:
  - `RecipePhoto` de 48 px (`rounded-lg`, radio 8).
  - El bloque de texto (`min-w-0 flex-1`): nombre `text-body-lg font-medium break-words`,
    `recipePortionText(…)` en `text-subheadline text-muted-foreground` y "Fuente: …" en
    `text-footnote`.
  - A la derecha, `shrink-0 inline-flex items-center gap-1 text-callout font-medium text-primary`
    con `RECIPE_PICKER_TEXT.viewRecipe` + `ChevronRight`.

  Si no llegó el detalle (`recipes[id]` null), la fila no es tocable y no muestra "Ver receta".

### 4.5 `portal-recipe-sheet.tsx` (`"use client"`)

```ts
export function PortalRecipeSheet(props: { recipe: PortalRecipeView; trigger: React.ReactElement }): JSX.Element;
```

- `compact = useMediaQuery("(max-width: 767px)")`.
- `SheetContent side={compact ? "bottom" : "right"}` con
  `className={cn("theme-portal p-0", compact ? "pt-0" : "w-full sm:max-w-lg")}`.
- `SheetHeader` con `material-bar sticky top-0 z-10 border-b px-5 pb-4 pr-14 text-left` y `pt-7` en
  `compact`, así el agarre no tapa el título y el encabezado sirve para arrastrar (`data-sheet-handle`
  ya viene en `SheetHeader`).
- `RecipeDetailBody` queda igual que en 018c-2 (`photoScope="portal"`, `showMacros={false}`,
  `preparationOpen`).
- `trigger` es un **elemento** que arma el cliente (`PortalMealItems`), no una función (T9a).

### 4.6 Rutas y bot

`/portal/plan` y `/portal/plan/pdf` no cambian (el PDF es el mismo archivo). El bot no cambia.

## 6-3. Pantallas (skill `ui`)

| Vista | Estructura base | Componentes clave |
|---|---|---|
| Tu plan (semanal) | Shell del portal | `h1` del plan + notas; botón `tinted` "Descargar plan (PDF)"; `DaySelector` con "Hoy"; `h2` del día; `Card` por comida (título + "Todos los días" en texto, "Elegí una de estas opciones"); filas de alimento (nombre / cantidad + gramos secundarios); filas de receta tocables con miniatura y "Ver receta ›" |
| Tu plan (no semanal) | Igual, sin selector | Comidas una debajo de otra |
| Sin plan | Shell | `EmptyState` "Todavía no tenés un plan." |
| Ver receta | `Sheet` inferior con agarre (derecha ≥ 768 px), encabezado con material y título | `RecipeDetailBody` sin macros: foto, ingredientes en medida casera, preparación abierta, tips, "Fuente: …" |

## 7-3. Archivos, merge y conflictos

### 7.1 Armar la rama (Fase 0, **un commit: el merge**)

```bash
git switch feat/hu-017d2-diario && git pull --ff-only     # punta aprobada de 017d-2
git switch -c feat/hu-017d3-plan
git fetch origin
git rev-parse feat/hu-018d-medidas-caseras origin/feat/hu-018d-medidas-caseras   # iguales; si no, git branch -f … origin/…
git merge-base --is-ancestor feat/hu-018d-medidas-caseras develop && echo "018d ya está en develop: rebasear sobre develop en lugar de mergear (Resolución D14)"
git merge --no-ff feat/hu-018d-medidas-caseras -m "HU-017d-3: merge de feat/hu-018d-medidas-caseras (018c-1, 018c-2, 018d)"
```

**Conflictos esperados y cómo se resuelven:**

| Archivo | ¿Conflicto? | Resolución |
|---|---|---|
| `progress/current-senkuch4n.md` | **sí** (hoy ya da conflicto) | Es la bitácora del orquestador: **se quedan las dos partes**. Primero va la versión de esta rama (`--ours`: estado de 017d) y, en la sección de HU cerradas o de historia, las entradas de 018c/018d de `--theirs` que falten, en orden por fecha y sin repetir. Nada se descarta. Si el implementer no está seguro, para y se lo deja al orquestador (Q16). |
| `progress/history.md` | no (`merge=union`) | Se revisa que no queden líneas duplicadas. |
| `packages/core/src/index.ts` | no, si 017d-1 agregó `./portal` **al final** (T2) | Si choca: quedan las tres líneas, `./recipe-picker` y `./household-measures` donde las puso 018 y `./portal` al final. |
| `backlog/HU-018c.json`, `backlog/HU-018d.json` | no (solo los cambia 018) | Se toman como vienen. El implementer no los edita. |
| `apps/web/src/app/(portal)/portal/plan/*` | no (017d-1/2 no los tocan, T11) | Si apareciera alguno: **se toma `--theirs` (018d) entero** y la presentación de 017d se aplica después, en las fases 1–2. |
| `portal/page.tsx`, `portal/diario/**`, `evolucion/**`, `layout.tsx`, `portal-header.tsx` | no (018 no los toca) | — |
| Cualquier otro | no esperado | Si aparece, parar y anotarlo en `progress/impl_HU-017d.md`. No se resuelve borrando lado. |

**Después del merge (antes de cualquier cambio de 017d-3):**

```bash
npm install                               # el merge cambia package.json de packages/db (scripts) y puede traer deps
npm run db:generate                       # cliente Prisma con FoodMeasure y los campos measure* de MealItem
cd packages/db && npx dotenv -e ../../.env -- npx prisma migrate status   # "Database schema is up to date!" (food_measures ya aplicada)
cd ../.. && npm run typecheck && npm run test   # en verde ANTES de tocar nada (el merge solo)
```

- **Reiniciar el dev server:** si el usuario tiene `npm run dev` (o `next start`) levantado, hay que
  **pararlo y volver a levantarlo**. El proceso tiene cargado el cliente Prisma viejo y sin reinicio
  falla en runtime con "Unknown field `measureQty`" o `prisma.foodMeasure` undefined en el plan, el
  editor y los alimentos. El implementer no mata el proceso del usuario: le avisa al orquestador para
  que se lo pida. Si el bot está corriendo, también se reinicia (importa `@nutri-bot/db`).
- Si `migrate status` dice otra cosa que "up to date" (drift, migración pendiente o fallida): **parar y
  avisar.** Nada de `migrate dev`, `reset` ni `resolve` (AGENTS.md).
- El commit de la fase es el del merge. `git push -u origin feat/hu-017d3-plan` solo si el orquestador
  lo pide.

### 7.2 Archivos de 017d-3 (después del merge)

| Archivo | Acción |
|---|---|
| `apps/web/src/components/weekly-menu/day-selector.tsx` | `today?` (4.1) |
| `apps/web/src/app/(portal)/portal/plan/page.tsx` | no pasa totales (4.2) |
| `apps/web/src/app/(portal)/portal/plan/plan-view.tsx` | 4.3 |
| `apps/web/src/app/(portal)/portal/plan/portal-day-view.tsx` | 4.4 |
| `apps/web/src/app/(portal)/portal/plan/portal-recipe-sheet.tsx` | 4.5 |
| `apps/web/src/app/(portal)/portal/plan/portal-day-view.test.tsx` | nuevo (9-3) |
| `apps/web/src/components/weekly-menu/day-selector.test.tsx` | nuevo (9-3) |

## 8-3. Checklist (un commit por fase)

- **Fase 0** (commit = merge, 7.1): rama, merge, conflictos, `npm install`, `db:generate`,
  `migrate status`, typecheck + test del merge solo, y el aviso de reiniciar el dev server.
- **Fase 1** (`HU-017d-3: "Hoy" en el selector de días del portal`): `day-selector.tsx` + test.
- **Fase 2** (`HU-017d-3: plan sin macros, comidas legibles y receta en un sheet inferior`): `page.tsx`,
  `plan-view.tsx`, `portal-day-view.tsx`, `portal-recipe-sheet.tsx` + test. `typecheck` de los 4
  workspaces.
- **Fase 3** (`HU-017d-3: implementación y verificación`, solo `progress/impl_HU-017d.md`): 10-3.

## 9-3. Tests

- **`day-selector.test.tsx`** (`renderToStaticMarkup`):
  - Sin `today`, el HTML es idéntico al de hoy (snapshot inline del editor con `includeWeek`).
  - Con `today="TUE"`: el martes contiene "Hoy" y `aria-label="Martes, hoy"`.
  - Con `today` + `loadedDays` sin el martes: `aria-label="Martes, hoy, sin cargar"`.
- **`portal-day-view.test.tsx`** (`renderToStaticMarkup` de `PortalMealItems`/`PortalMealCard`):
  - Un alimento con medida → "1½ tazas" y "270 g".
  - Uno en gramos con 37,5 → "37,5 g".
  - `EVERY_DAY` → "Todos los días" sin la clase de `Badge`.
  - `isOptions` → "Elegí una de estas opciones".
  - Una receta con detalle → un `<button>` que contiene el nombre y "Ver receta".
  - El HTML no contiene "kcal", "Proteínas", "Carbohidratos", "Grasas" ni "Fibra".

## 10-3. Verificación

- Los comandos de 10.1, ahora con **todo el monorepo** (el merge trae core, db y web de 018):
  `db:generate`, `typecheck` (4 workspaces), `test`, `lint --workspace apps/web`, `verify.sh` y los
  builds de webpack y Turbopack en una copia (la copia lleva `npm run db:generate` antes del build).
- **Runtime con `next start`** (puerto libre), con un plan semanal de prueba **solo si no hay uno real
  activo para mirar**. Si se crea, se crea con la paciente de prueba de 10.3 desde el panel (o por
  SQL), con ids anotados, y se borra por id: `NutritionPlan`, `Meal` y `MealItem` de ese plan.
  - `/portal/plan` → sin "kcal" ni nombres de macros en el DOM **ni en el HTML/RSC de la respuesta**.
    Con 018d los ítems de alimento siguen trayendo `macros` en el payload (Q11): se mira solo que no se
    **muestre**, y se anota.
  - El día de hoy marcado "Hoy"; cambiar de día → fundido; día vacío → el texto nuevo.
  - Receta → toda la fila abre el sheet inferior a 390 px y el lateral a 1366 px; se cierra arrastrando
    desde el encabezado, con Esc y con la X; el foco vuelve a la fila.
  - "Queso untable descremado tipo crema" + "2 cucharadas soperas" a 390 px → el nombre baja de
    renglón y la cantidad no se corta.
  - "Descargar plan (PDF)" → `GET /portal/plan/pdf` 200 `application/pdf`.
  - Sin hidratación rota ni "cannot be passed".
- **Alcance:** `git diff feat/hu-018d-medidas-caseras...HEAD --name-only` **sin el merge**, o sea
  `git diff <commit del merge> --name-only` → solo 7.2. La zona de imleticio (T6) no aparece en ese
  diff. `git diff <commit del merge> -- apps/web/src/components/macro-totals.tsx` → vacío.
- **Recorrido del orquestador** (390 px, Safari o simulador): D19 (2) "decir qué come hoy en el
  almuerzo". Los criterios "Receta en el plan" y "Alimento en medida casera" se verifican acá (HU §4.3).
- **PR:** el de 017d-3 se mergea **después** del #28 (018d). Si para entonces 018c-2/018d ya están en
  `develop`, se rebasea y el merge desaparece (Resolución D14). En el PR hay que avisarle a imleticio
  que se tocó la presentación del portal del plan y `DaySelector` (`today?`), y avisarle a la
  nutricionista que las notas de las mediciones dejaron de verse en el portal (D2).

---

## 12. Dudas técnicas (numeradas, cada una con recomendación)

Ninguna bloquea el arranque de 017d-1. Si el orquestador no dice otra cosa, el implementer aplica la
recomendación.

- **Q1. ¿"Nutricionista" (el nombre del seed) cuenta como "sin nombre"?** En dev, `Professional.name =
  "Nutricionista"` y `title` es null. Con la regla literal (solo nombre vacío), el inicio diría "Tu
  espacio con Nutricionista", que es justo el PO5 que la HU quiere arreglar. *Recomendación:* sí.
  `portalProfessionalLine` trata `name` igual a "Nutricionista" (trim, sin mayúsculas ni tildes) **y**
  `title` vacío como sin nombre → "Tu espacio con tu nutricionista". El `Wordmark` del header sigue
  mostrando lo que devuelve `getProfessionalPortalName` (fuera de alcance).
- **Q2. Pantalla de link vencido: el layout no recibe `searchParams`.** Opciones: (a) un componente
  cliente con `useSearchParams` dentro de `Suspense` en el layout; (b) que `/portal/login` deje una
  cookie corta "link vencido" y el layout la lea con `cookies()`; (c) mover la pantalla sin sesión a
  cada página. *Recomendación:* (a). No cambia `/portal/login`, no deja estado y funciona con la URL
  que ya existe. El fallback del `Suspense` es la variante "sin link". El servidor dinámico resuelve
  `useSearchParams` con la URL real, así que no hay salto de contenido.
- **Q3. La firma: ¿con matrícula?** El Gherkin dice "Tu espacio con Lic. Daiana Ponce" y la UX §4.2 dice
  "con matrícula, como hoy". *Recomendación:* con matrícula (`professionalSignature`), como la UX y
  como hoy. El ejemplo del Gherkin corresponde a una profesional sin matrícula cargada.
- **Q4. Sheet que queda a mitad de camino al vetar el cierre por arrastre.** Afecta "Anotar comida" (y
  hoy `ServiceSheet` de 017b-2). *Recomendación:* arreglarlo en `SheetPanel`, como dice 4.6 de 017d-2:
  sin cambio de API, el panel vuelve a 0 si después del `onDismiss` sigue presente. Alternativa
  descartada: desactivar el arrastre cuando hay texto, porque el criterio "Cerrar con algo escrito"
  pide que el arrastre pregunte.
- **Q5. "Guardar" por encima del teclado en Safari de iOS.** iOS no achica el layout viewport al abrir
  el teclado y un sheet `fixed bottom-0` queda debajo. *Recomendación:* `useKeyboardInset`
  (`visualViewport`) solo en `DiaryEntrySheet` compacto, para levantar el panel por el alto del
  teclado. Si en el simulador no hace falta (el contenido entra arriba del teclado), queda igual: es
  inofensivo con inset 0. Alternativa: "Guardar" en el encabezado del sheet, estilo iOS. Se descarta
  porque la HU pide el botón lleno abajo.
- **Q6. La lista del diario sin bytes: ¿función nueva en `domain` o `select` en la página?**
  *Recomendación:* `select` en la página del portal. Es una consulta que usa solo el portal (AGENTS.md:
  `domain` es para lo que comparten web y bot), deja `packages/db` sin cambios en 017d-1/2 (T3) y no
  fuerza `typecheck` del bot por un cambio de `domain`. El panel sigue con `listDiaryEntries` (traer los
  bytes ahí es un tema aparte que no pide esta HU).
- **Q7. `deleteDiaryEntryAction` cambia de `(formData) => void` a `(id) => Promise<{ ok; error? }>`.**
  La HU dice que "se queda igual" refiriéndose a que verifique la dueña, y eso se mantiene.
  *Recomendación:* cambiar la firma. Su único consumidor es la página del diario, y el borrado
  diferido necesita un `CommitResult` para devolver el registro si falla. El caso "ya no existe" da
  `ok: true` (idempotente, T9d).
- **Q8. ¿Achicar la foto al elegirla o al guardar?** *Recomendación:* al elegirla. La miniatura muestra
  lo que se va a subir, el error de "foto que no se puede usar" aparece en el momento y "Guardar" no
  tarda más. Mientras tanto se muestra "Preparando la foto…" y "Guardar" queda deshabilitado.
- **Q9. HEIC y `accept`.** Con `accept="image/png,image/jpeg,image/webp"` (lo de hoy), algunas galerías
  no muestran fotos HEIC. *Recomendación:* `accept="image/*"`. Safari de iOS entrega JPEG o decodifica
  HEIC en `createImageBitmap`, y el resultado siempre se re-codifica a JPEG. En un navegador que no
  decodifica HEIC (Chrome de escritorio), la foto da "Esa foto no se puede usar. Probá con otra." El
  servidor sigue aceptando solo JPG/PNG/WEBP.
- **Q10. ¿`page.tsx` deja de mandar los totales?** D14 dice que 017d no cambia los datos que arma
  `page.tsx` en 018. Sacar `totals`/`dayTotals` de las props no cambia ninguna consulta ni función de
  018: solo deja de mandar al navegador números que ya no se muestran. *Recomendación:* sacarlos (4.2).
  `computeWeeklyTotals` se sigue usando en el servidor para `isWeekly` y `loadedDays`.
- **Q11. Los ítems de alimento siguen trayendo `macros` en el payload del portal** (`portalMealsForClient`
  solo limpia las recetas). No se muestran, pero están en el RSC. *Recomendación:* no tocarlo en 017d
  (D14: es de 018 y está en `lib/portal-recipe.ts`). Anotarlo en el PR para que imleticio o quien tenga
  018 decida si los limpia también. No es un dato sensible, es técnico.
- **Q12. Menor de edad con `birthDate` `@db.Date`.** `calculateAge` (`lib/age.ts`) usa los getters
  locales del proceso, que con una fecha a medianoche UTC pueden correr un día. *Recomendación:*
  `isMinorOn` en core, con getters UTC para `birthDate` y `dayKeyInTz(now, tz)` para hoy (tests en
  9-1). `lib/age.ts` no se toca.
- **Q13. Cookie `Secure` con `next start` y Safari.** `setPatientSessionCookie` marca `secure` en
  producción. Chrome acepta cookies `Secure` en `http://localhost`, y Safari (o el simulador por IP) no
  siempre. *Recomendación:* el runtime automatizado con Chromium va contra `next start`, y el recorrido
  en Safari o simulador contra `next dev`. No cambiar `patient-session.ts`.
- **Q14. Nombres de rama.** *Recomendación:* `feat/hu-017d-portal` (017d-1, la actual),
  `feat/hu-017d2-diario` y `feat/hu-017d3-plan`, encadenadas como en 017c. El orquestador puede
  cambiarlos y no afecta nada más de la SDD.
- **Q15. `EvolutionChart` sin animación con movimiento reducido también cambia el panel.**
  *Recomendación:* aceptarlo. Es una mejora de accesibilidad sin cambio visual con el movimiento
  normal, y el componente no es de la zona de imleticio.
- **Q16. ¿Quién resuelve el conflicto de `progress/current-senkuch4n.md` en el merge de 017d-3?** Es la
  bitácora del orquestador, y el implementer no debería escribirla. *Recomendación:* el orquestador
  hace la Fase 0 de 017d-3 (merge, conflicto, `npm install`, `db:generate`, `migrate status` y el aviso
  de reinicio) antes de lanzar al implementer, y el implementer arranca en la Fase 1. Si igual la hace
  el implementer, resuelve "las dos partes" como dice 7.1 y lo marca en su `impl`.

---

## Decisiones (2026-10-05, modo autónomo del orquestador)

- SDD aprobada. **Q1–Q16 aceptadas con su recomendación.**
- Q1: el nombre "Nutricionista" de la profesional en dev es un dato del usuario (se cambia en Ajustes); no se toca.
- Q16: el merge de `feat/hu-018d-medidas-caseras` para 017d-3 lo hace el orquestador (resuelve la bitácora) antes de
  lanzar el implementer de 017d-3; después, `db:generate` y reinicio del dev server.
- Implementer: Opus; skills ui-ux-pro-max, apple-design, web-design-guidelines, mblode-agent-skills-ui-animation.
  Reviewer: Opus.
