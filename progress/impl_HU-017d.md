# Implementación HU-017d (portal del paciente)

## 017d-1: acceso, inicio y evolución

- **Estado:** done
- **Rama:** `feat/hu-017d-portal` (sale de 017b-4; `git merge-base --is-ancestor 0aec47b HEAD` → 0)
- **Modelo:** Opus. Skills: apple-design, web-design-guidelines (autochequeo), ui-ux-pro-max /
  mblode-agent-skills-ui-animation (criterios aplicados: press de tarjeta, sin animación nueva fuera de
  `press-sm` y de la entrada del gráfico).
- **Sin migraciones, sin cambios en `schema.prisma`, `packages/db`, `apps/bot` ni `messages.ts`.**

### Commits (uno por fase)

| Commit | Fase |
|---|---|
| `90596bb` | 1 core: `portal.ts` + `portal.test.ts` + `export *` al final de `index.ts` |
| `0ece561` | 2 acceso y shell: `getProfessionalPortalContact`, `PortalAccessGate/Screen`, layout con `Suspense` + `ConfirmProvider`, header sin "Salir", `loading.tsx`, `error.tsx` sin `detail` |
| `63b0cbd` | 3 inicio: `PortalCardLink`, `PortalLogoutButton`, `portal/page.tsx` |
| `df85010` | 4 evolución: `evolucion/page.tsx` (select sin `note`) + `EvolutionChart` con `isAnimationActive={!reduced}` |
| `aefe6da` | Q4: `primitives/sheet.tsx`, el panel vuelve a 0 si el dueño veta el cierre por arrastre (pedido del orquestador, ver abajo) |
| `bc26ebe` | Ajuste del autochequeo de UI: `break-words` en el título del plan |
| (este) | 5 verificación: este archivo |

### Archivos tocados

- `packages/core/src/portal.ts` (nuevo), `packages/core/src/portal.test.ts` (nuevo, 32 tests), `packages/core/src/index.ts` (última línea)
- `apps/web/src/lib/shell.ts` (`getProfessionalPortalContact`)
- `apps/web/src/app/(portal)/layout.tsx`, `portal/page.tsx`, `portal/evolucion/page.tsx`, `portal/loading.tsx`, `portal/error.tsx`
- `apps/web/src/components/portal/portal-access.tsx` + `portal-access.test.tsx` (5 tests), `portal-card-link.tsx`, `portal-logout-button.tsx` (nuevos)
- `apps/web/src/components/shell/portal-header.tsx` (sin "Salir", sin imports de `LogOut`/`Button`; `activeHref` sigue)
- `apps/web/src/components/evolution-chart.tsx` (movimiento reducido; sin cambio de props)
- `apps/web/src/components/primitives/sheet.tsx` (Q4; sin cambio de API)

### Contrato compartido

Las firmas coinciden con la SDD 4.1, 4.2, 4.3 y 4.5: `PORTAL_TEXT` (textos exactos), `portalGreeting`,
`portalProfessionalLine`, `professionalWhatsappUrl`, `diaryTodayText`, `startOfTodayInTz`, `isMinorOn`,
`formatPortalDate`, `formatWeightKg`, `formatHeightMeters`, `PortalWeightSummary`/`portalWeightSummary`,
`PortalHeightSummary`/`portalHeightSummary`, `PortalEvolutionRow`/`portalEvolutionRows`,
`getProfessionalPortalContact()`, `PortalAccessGate`, `PortalAccessScreen`, `PortalCardLink`,
`PortalLogoutButton`. Antes de crearlas: ningún export de core ni de la rama de 018d usaba esos nombres
(`git grep … feat/hu-018d-medidas-caseras -- packages/core/src` vacío).

### Decisiones no obvias

- **Q4 en 017d-1.** La SDD lo ubica en 017d-2 (4.6), pero el orquestador lo pidió en esta entrega. Va en
  su propio commit. `SheetPanel` guarda en un ref `open && isPresent`. En `onDismiss`, después de
  `setOpen(false)`, un `requestAnimationFrame` mira el ref: si el sheet sigue abierto (el dueño vetó),
  pone `exitVelocity` en null y anima `offset` a 0 (`springs.standard`, o `fades.fast` con movimiento
  reducido). Sin veto, el panel deja de estar presente y la salida sigue como antes. **No se verificó en
  runtime:** en 017d-1 no hay ningún sheet del portal, y el único que veta (`ServiceSheet`, 017b-2)
  está en el panel, detrás de Google. Queda para el runtime de 017d-2 ("Anotar comida" con texto →
  arrastrar → "¿Descartar…?" → Cancelar → el panel vuelve a su lugar). **017d-2 no tiene que volver a
  hacer 4.6.**
- **ConfirmProvider en el portal:** envuelve todo el shell con paciente (header, `main`, `PortalNav` y
  `Toaster`). El `AlertDialog` se monta en `document.body`, fuera de `.theme-portal`, igual que en el
  panel. Verificado en runtime: abre, cancela y sale. `useConfirm` se llama en `onClick` (no dentro de
  una action ni de una transición, por la nota de deadlock de `confirm.tsx`) y después hace
  `requestSubmit()` del `<form hidden action="/portal/logout" method="POST">`.
- **T9a:** el servidor no le pasa funciones ni componentes a clientes. Los íconos de `PortalAccessScreen`
  y `PortalLogoutButton` se importan del lado cliente. `PortalCardLink` es server-safe y dibuja su
  `ChevronRight`. `EmptyState icon={TrendingUp}` se usa en un server component que no es cliente.
- **T9e:** sin `useId` en lo que dibuja el layout. Ids fijos `portal-access-title` y `portal-next-appointment`.
- La tarjeta del turno es un `<section aria-labelledby>` con `h2`. Dentro de las tarjetas tocables, los
  títulos van en `<p>` y no en `h2`, porque el link tiene `aria-label`.
- `formatHeightMeters` redondea los cm a entero antes de dividir por 100, así `165,5` da `1,66` sin
  depender del redondeo binario. `formatWeightKg` redondea a 1 decimal antes del `Intl`.
- `portalProfessionalLine` (Q1) normaliza con NFD, así que "NUTRICIONÍSTA" también cuenta como el nombre del seed.
- `npm run db:generate` corrió en el preflight y no tocó la base.

### Verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck` | core, db, bot y web en verde |
| `npm run test` | 128 archivos, **2098 tests** OK (incluye `portal.test.ts` 32 y `portal-access.test.tsx` 5) |
| `npm run lint --workspace apps/web` | "No ESLint warnings or errors" |
| `./ops/harness/verify.sh` | "Arnés OK" (el WARN "se tocó el bot" sale porque cambió core; el bot no cambió) |
| `next build` (webpack, en una copia del scratchpad) | exit 0. El único warning es el de `jose`/Edge Runtime, que ya estaba. Sin "useSearchParams() should be wrapped…" ni "use server" |
| `next build --turbopack` (misma copia) | "Compiled successfully", exit 0 |

**Runtime** con `next start -p 3198` y Chromium headless (playwright-core, 390×844 táctil, 768×1024 y
1366×768), **sobre los dos builds** (webpack y Turbopack): **77/77 chequeos OK en cada uno**.
- Sin cookie: `/portal` muestra "Para entrar necesitás un link". `/portal/login?token=basura` y el token
  vencido (`createPatientToken(id, -1)`) terminan en `/portal?error=invalid`, con "Este link ya venció" y
  "cada link dura 15 minutos", y sin el texto de sin link. No hay botón de WhatsApp (`phoneJid` null en
  dev). En 20 cargas por ancho, la consola queda sin errores ni avisos de hidratación.
- Con el token válido de la paciente de prueba: "Hola, Prueba 👋", "Tu espacio con tu nutricionista",
  "Mañana, 10:00" + "Falta pagar la seña para confirmarlo" (gana el turno con seña de las 10:00 sobre el
  confirmado de las 11:30, D6), "28,4" + "hace 3 semanas" en la tarjeta. La tarjeta de evolución es
  `<a aria-label="Tu evolución">` y, tocada en una esquina (12,12), navega. `header form[action="/portal/logout"]`
  da null. Todos los `a`/`button` de `main` miden ≥ 44 px de alto. No hay scroll horizontal. 10 recargas
  sin errores de consola.
- `/portal/evolucion`: "28,4 kg", "Último registro: hace 3 semanas", "1,30 m", "Medida hace 3 semanas". La
  paciente es menor, así que no aparece "menos que", "más que" ni "Igual que". El historial tiene 2 filas:
  la medición sin peso ni altura no aparece. **"NOTA-CLINICA-017d" no está ni en el DOM ni en el HTML/RSC de
  la respuesta** (`request.get(...).text()`). No se ve el error boundary.
- "Salir del portal" abre el diálogo "¿Salir del portal?" con el texto de la HU. "Cancelar" deja la
  sesión abierta. "Salir" lleva a "Para entrar necesitás un link" y la cookie `patient_session` desaparece.
- Con `reducedMotion: "reduce"`, las 2 barras del gráfico tienen el mismo alto al cargar y 1,5 s después
  (no crecen).
- Log del servidor (los dos builds): sin "cannot be passed to Client Components", sin "Functions cannot
  be passed" y sin errores.
- Capturas a 390 px (inicio, evolución y link vencido) en el scratchpad de la sesión, no en el repo. **No
  se tomaron las capturas "antes" (0.4)**: no son parte del criterio y el dev server iba a recargar con
  los cambios.

### Datos de prueba (creados y borrados por id)

- El bot estaba apagado: `ps` no mostró ningún proceso de `apps/bot`.
- Conteos de antes, `Patient|Appointment|EvolutionEntry|DiaryEntry|OutboundMessage`: `21|22|17|2|12`.
- Se crearon la paciente `hu017d-paciente` (JID inventado `5493510017401@s.whatsapp.net`, nacida el
  2018-05-10), `hu017d-ev-1/2/3` (la 2 con la nota de prueba y la 3 sin peso ni altura) y
  `hu017d-turno-a` (CONFIRMED 11:30) y `hu017d-turno-b` (AWAITING_PAYMENT 10:00), mañana, con
  `needsGoogleSync=false`.
- `OutboundMessage` de esos turnos antes de limpiar: 0. Se borró por id: 2 turnos, 3 mediciones y 1 paciente.
- Conteos de después: `21|22|17|2|12`, iguales a los de antes.
- El token no se guarda en la base. Los tokens estuvieron solo en un archivo del scratchpad, que ya se
  borró. Se borraron la copia del build y `playwright-core`, y el `next start` de :3198 está apagado.

### Para el orquestador / recorrido

- **El dev server de :3100 (Turbopack) devuelve 500 en `/portal`:** `getProfessionalPortalContact is not
  a function`. Tiene en caché el módulo `lib/shell.ts` de antes. Hacer `touch` no alcanzó. Los dos builds
  limpios y su runtime andan, así que hay que reiniciar ese dev server para el recorrido. No lo paré.
- El `Wordmark` del header y de la pantalla de acceso sigue diciendo "Nutricionista" (valor del seed).
  Está fuera de alcance según Q1.
- D20 (contraste de las tarjetas con el brillo bajo) y D19 quedan para el recorrido.
- La tarjeta del plan como `<a>` no se probó en runtime porque la paciente de prueba no tiene plan. Usa
  el mismo `PortalCardLink` que la de evolución, que sí se probó.
- Las etiquetas del eje del gráfico usan la zona del navegador (`Intl.DateTimeFormat` sin `timeZone`, ya
  estaba así). El historial usa la zona de la profesional.
