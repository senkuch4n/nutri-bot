# Review — HU-006

**Veredicto:** APPROVED (ronda 2, sobre la HU-006 completa; ver la sección "Ronda 2" al final)

## Ronda 1 (histórico)

**Veredicto de la ronda 1:** CHANGES_REQUESTED

Primer intento de revisión. Hay un solo hallazgo bloqueante, chico y localizado (1). Lo demás está
bien: fórmulas, tests, migración, privacidad y reuso de la HU-004.

## Verificación que corrí yo
- `npm run typecheck`: exit 0 (core, db, web, bot).
- `npm run test`: 25 archivos, 365 tests OK.
- `npm run isak:validate`: exit 0, **100 OK · 2 TOLERADA · 3 CONOCIDA · 0 DIF**, la misma tabla que
  `impl_HU-006.md`. Las filas no OK son el Z de la masa en los dos casos (D7, ±0,02), el Z del muslo
  corregido en los dos casos (D5) y el Z adiposo del Excel (D6). Los encabezados solo muestran
  `Caso: <tipo> · sexo · edad`: no aparece ningún nombre.
- `npm run isak:validate -- --check-leaks`: "Sin fugas del nombre en archivos versionados", exit 0.
- Control de privacidad independiente, con mi propio script en el scratchpad y el nombre leído solo
  en memoria. Busqué las palabras del nombre (celda B6 del xlsx y línea `Nombre:` del PDF) en
  `git ls-files` y en los archivos nuevos sin trackear, sin tener en cuenta las rutas del home. **Ningún
  archivo del diff tiene palabras del nombre del evaluado.** Solo aparecen en
  `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf`, que ya estaba versionado, está fuera de esta HU y
  ya lo señala la SDD 10.5. La única otra coincidencia es un nombre de pila que coincide en
  `progress/history.md` línea 10, donde se refiere al usuario y no al paciente, y que está fuera del
  diff. `docs/ISAKMetry_*` está ignorado por `.gitignore:19`, y `git ls-files | grep -i isakmetry`
  devuelve 0.
- Fixtures (`packages/core/src/isak-fixtures.test-data.ts`): solo los números de la HU (A y B) y el
  caso sintético C, sin nombre, fecha ni evaluador. Las fechas de `test-isak.ts` (2025-11-05,
  2026-05-08, nacimiento 2004-01-15) son las de la SDD y no están en las exportaciones.
- `./ops/harness/verify.sh`: exit 0, "Arnés OK". Solo sale el WARN recordatorio de migración nueva,
  que ya revisé.
- Base (solo lectura): EvolutionEntry 15, Consultation 18, `study is not null` 0, ningún paciente
  `test-hu006-%` ni `hu006_walk_a`. `migrate status`: 14 migraciones, up to date.
- No corrí `test:isak` ni `test:confirm-flow` porque escriben en la base y mi rol es de solo lectura.
  El implementer los reporta OK. Leí `test-isak.ts`: borra por ids (líneas 163-165) y chequea
  `OutboundMessage` (línea 150).

## Checkpoints
- C1 backlog válido, ≤1 HU activa: [x]
- C1 progress/current.md refleja la HU: [x]
- C1 verify.sh exit 0: [x]
- C2 docs/hu-antropometria-isak.md completa, con Resoluciones: [x]
- C2 SDD con workspaces, checklist y contrato: [x]
- C2 firmas del diff = contrato: [x]. Se respetan los nombres de la sección 4. `DW_TABLE` queda
  privada y se agregan `Sum6Input`, `Sum8Input` y `MUSCLE_BONE_TONES`, todos cambios aditivos.
- C3 lógica pura en core y base en `packages/db/domain`, sin duplicar: [x]. Las fórmulas están en
  `isak.ts`. `isak-study.ts` arma el estudio y en `isak-study.ts:529-537` reusa
  `buildAnthropometricDiagnosis` (IMC, ICC, cintura/talla y conicidad no se reimplementan). Las
  filas y los tonos del diagnóstico se extrajeron a `diagnosis-rows.tsx`, y
  `anthropometric-diagnosis.tsx` los importa sin cambiar el JSX. Los textos de faltantes reusan
  `DIAGNOSIS_TEXT` (`isak-study.ts:242-243`).
- C3 schema/domain: web y bot compilan: [x]
- C3 migración aditiva y coherente: [x]. El SQL coincide exactamente con la SDD 3.2: CREATE TYPE, 12
  ADD COLUMN nullable y CREATE UNIQUE INDEX, sin DROP, NOT NULL ni ALTER COLUMN. El índice
  `(consultationId, study)` no rompe las mediciones comunes porque en Postgres los NULL son
  distintos y las 15 filas quedaron con `study` NULL.
- C3 rutas protegidas / portal: [x]. La página nueva está bajo `(panel)`, que tiene middleware y
  `auth()` en el layout. Si la consulta es de otro paciente devuelve `notFound()`. Las actions
  validan ids y `belongsToPatient`, y en `domain/isak.ts` update y delete filtran por
  `{id, consultationId, study: "ISAK"}`. El portal no se tocó.
- C3 bot en silencio / textos: [x]. El bot no se tocó y no hay textos de WhatsApp.
- C3 sin console.log de debug ni TODOs: [x]. Los `console.error` de las actions son de errores
  reales.
- C4 typecheck limpio: [x]
- C4 tests de core en verde y no circulares: [x]. Los esperados son literales de la HU o de la SDD,
  no se recalculan con la misma fórmula. Tolerancias D5, D6 y D7 documentadas en el test y
  erratas del IDG de B (10.1.1) comentadas.
- C4 flujo del bot simulado: [x] (no aplica, el bot no cambió)
- C4 PDF/documento: [x] (no aplica)
- C5 impl_HU-006.md existe y describe lo tocado: [x]
- C5 review con veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba en la base: [x]
- **UI / regla de `useConfirm`**: [ ]. `confirm()` se llama bien, fuera de transición y de
  `<form action>` (`delete-isak-study-button.tsx:30-36`, `isak-form.tsx:141-151`), pero el cierre
  del formulario actualiza el estado del padre durante el render (hallazgo 1).

## Revisión de fórmulas (contra la SDD 4.1)
Revisé todas las fórmulas contra la referencia de la SDD y coinciden. Además las 100 comparaciones
contra ISAKMetry dan OK.
- **Phantom** (`isak.ts:126-168`): los 26 valores coinciden con la tabla 4.1.2, incluido el s = 2,27
  del brazo flexionado (D7) y el Phantom del muslo corregido (D5). Z = (v·k^d − p)/s con d = 3 para
  masas.
- **Durnin-Womersley**: los 20 coeficientes coinciden con la publicación (D21). Los tramos son
  hombres ≥ 17 y mujeres ≥ 16, y Siri es 495/D − 450.
- **Kerr**: (Σ6·k − 116,41)/34,79 y kg = (Z·5,85 + 25,6)/k³. El Z adiposo sale del Σ6 y no de los kg
  (D6).
- **Lee**: talla(m)·(0,00744·PBC² + 0,00088·PMC² + 0,00441·PPC²) + 2,4·sexo − 0,048·edad + 0 + 7,8.
- **Rocha**: 3,02·(H²·R·F·400)^0,712, todo en metros.
- **Heath-Carter**: los coeficientes de endomorfia, mesomorfia y ectomorfia coinciden con Carter
  (2002). Los 3 tramos del HWR y el piso de 0,1 están bien. La somatocarta se calcula con los
  componentes sin redondear y la categoría con los redondeados, con el algoritmo de la SDD.
- **Perímetros corregidos**: perímetro − π·pliegue/10. Distribución adiposa y muscular e IDG (D11)
  según la SDD.
- **Redondeo**: se redondea una sola vez, en `buildIsakStudy`. Los Z muscular, óseo y residual usan
  los kg redondeados y el Z de la masa grasa usa los kg exactos, como fija la SDD.
- **D13 (menores de 18)**: el orden de chequeo es menor → medidas → sexo → edad
  (`isak-study.ts:238-245`). Composición, IAM e IMO devuelven `not_for_minors`, y la página oculta
  las secciones 2 y 4 (`antropometria/page.tsx`, bloques `minor ? null`). En el resumen se ocultan
  los tejidos y el IMO. Salud muestra solo el IMC sin clasificar, que resuelve la HU-004. Hay un
  test que lo cubre.
- **Somatocarta** (`antropometria/somatochart.tsx`): no hay Fragment como hijo directo de
  `ScatterChart` (los segmentos van en un array con `map` y el anterior es un condicional) y no hay
  colores nuevos. `isakTissueColors` usa hex que ya estaban en `chart-theme.ts`.

## Cambios requeridos
1. **`isak-form.tsx:93-95`: se llama a `onDone()` durante el render.** El bloque
   `if (state !== lastState) { setLastState(state); if (state.ok) onDone(); … }` corre mientras
   se renderiza `IsakForm`. `onDone` es `() => setMode("view")` del padre `IsakCard`
   (`isak-card.tsx:44`). O sea que cambia el estado de **otro** componente durante el render. React
   no lo admite y en desarrollo tira "Cannot update a component (`IsakCard`) while rendering a
   different component (`IsakForm`)" en cada guardado correcto. El patrón `lastState` de
   `ConsultationMeasurementForm` (`consultation-measurements.tsx:244-248`) solo cambia estado
   **propio** (`setFormKey`), y eso sí es válido. Esa parte de la SDD (7.3) se copió de un patrón
   que no se trasladó bien. Hay que dejar el ajuste de estado propio en el render, pero avisar al
   padre fuera del render: en un `useEffect` que dependa de `state` (con `state.ok`), o levantando
   un flag propio que dispare `onDone` en un efecto. El recorrido del orquestador no cubrió el
   formulario (lo dice `recorrido_HU-006.md`), así que después del arreglo conviene probar en el
   navegador el alta, la edición y el cancelar, mirando la consola.

## Dudas (no bloqueantes)
- `isak-form.tsx`: el formulario no usa `<form action>`. Usa `onSubmit` con `preventDefault` y
  `startTransition(() => action(formData))`. Es un desvío de la SDD 7.3, pero está justificado
  (React 19 resetea los campos no controlados después de una `<form action>`) y no rompe la regla
  de `useConfirm`. Lo acepto.
- `isak-form.ts`: cuando la talla es válida, "talla sentado > talla" le gana al error de rango de la
  talla sentado. Es necesario para cumplir el escenario 164/170 de la HU. El test "sentado = talla"
  se hace con 120/120 porque 164 queda fuera del rango 30–130. Es razonable.
- `NumberInput` es `type="number"`. Si el navegador está en un locale donde la coma no es el
  separador decimal, un valor con coma podría llegar vacío en el `FormData` y pasar por "sin dato".
  Esto no es nuevo: el formulario de mediciones ya funcionaba así. Conviene mirarlo en el recorrido
  (tipear "11,5").
- La fila ISAK sigue apareciendo en la pestaña Evolución con su botón de borrar genérico, si lo
  tiene. La SDD dice que Evolución no cambia, así que está en alcance tal como está. Si se quiere
  proteger el estudio, sería una mejora aparte.
- Fuera del diff: `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf` sigue versionado y tiene el nombre
  del evaluado (nota de la SDD 10.5). El orquestador tiene que decidirlo aparte.

## Ronda 2

**Veredicto:** APPROVED. Aplica a la HU-006 completa. Los checkpoints de la ronda 1 siguen en [x] y
el único que estaba en [ ] ahora queda en [x].

### Checkpoints (ronda 2)
- Todos los de la ronda 1: [x]. Volví a verificar typecheck, tests, verify.sh y privacidad (ver abajo).
- **UI / regla de `useConfirm` y actualizaciones de estado**: [x]. Ya no se actualiza estado del padre
  durante el render.

### Hallazgo 1 de la ronda 1: `onDone()` durante el render. Resuelto
- `isak-form.tsx:93-100`: el bloque `lastState` que corre en el render solo cambia estado propio
  (`setLastState`, `setErrors`, `setFocusFirstError`). No llama a `onDone`.
- `isak-form.tsx:104-111`: `onDone()` pasó a un `useEffect([state])` que sale si `!state.ok`. El
  `initialState` tiene `ok: false`, así que al montar no se llama.
- Doble llamada en StrictMode: `notifiedState` (`useRef`) guarda el `state` ya notificado. En React 19,
  StrictMode conserva los refs cuando vuelve a correr los efectos, así que el segundo pase sale en la
  línea 106. Aunque se llamara dos veces, `setMode("view")` es idempotente, así que no habría efecto
  visible.
- Orden del toast: `useActionToast` (`lib/notify.ts:29-34`) también es un efecto sobre `state`, y se
  declara antes (línea 79). Corre en el mismo commit, antes de que `setMode("view")` desmonte el
  formulario. Esto coincide con el toast que se ve en el recorrido.
- `confirm()` sigue fuera de transiciones y de `<form action>`: `handleCancel` (`isak-form.tsx:152-163`)
  es un handler de click. `handleSubmit` no llama a `confirm`.

### Ajuste 2 (orquestador): `key` de `IsakForm` en `isak-card.tsx`. Correcto
- `isak-card.tsx:37-46`: se quitó `key={study?.entryId ?? "new"}`. El diagnóstico está bien: la key
  cambiaba de "new" al id cuando la revalidación traía el estudio, eso remontaba el componente y se
  perdía el `state.ok` de `useActionState`.
- Precarga sin la key: `IsakForm` solo se monta en la transición "view" → "form" (ramas excluyentes
  del ternario, línea 36). Cada apertura es un montaje nuevo, con `defaultValue` desde `initial`
  (`study.values` o el prefill de peso y talla) y un `useActionState` recién inicializado. No queda
  ningún `state.ok` viejo que cierre el formulario al abrirlo.
- Alta seguida de edición: después del alta, `onDone` cierra el formulario y la vista muestra el
  estudio. "Editar" (línea 68) monta `IsakForm` con `entryId={study.entryId}`. Además, el hidden
  `entryId` (`isak-form.tsx:169`) es controlado y toma el valor de la prop en cada render, así que
  cualquier submit lleva el id vigente. No hay riesgo de un segundo alta que choque con el índice
  único `(consultationId, study)`.
- Caso de `startEditing` con `study`: arranca en "form" y el comportamiento es el mismo.

### Alcance
- Desde la revisión anterior (mtime de `progress/review_HU-006.md`, 07:33) solo cambiaron
  `isak-form.tsx` e `isak-card.tsx`, además de `apps/web/tsconfig.tsbuildinfo`, que es un artefacto de
  tsc. No hay cambios fuera del alcance de la ronda.
- `docker-compose.prod.yml` (sin trackear, del 31/08) es ajeno a la HU y ya se había anotado en HU
  anteriores y en `progress/current.md:22`. No se tiene que commitear con la HU-006.

### Verificación que corrí yo (ronda 2)
- `npm run typecheck`: exit 0 (core, db, bot, web).
- `npm run test`: 25 archivos, 365 tests OK.
- `./ops/harness/verify.sh`: exit 0, "Arnés OK". Sale el WARN recordatorio de la migración, que ya
  revisé en la ronda 1 (aditiva, sin NOT NULL ni DROP).
- `npm run isak:validate -- --check-leaks`: "Sin fugas del nombre en archivos versionados", exit 0.
  Los dos archivos tocados en esta ronda no tienen datos personales.
- Base (solo lectura, psql): EvolutionEntry 15, Consultation 18, `study is not null` 0, pacientes
  `%hu006%` 0. No quedaron restos del recorrido (`hu006_walk_b` se borró).
- No levanté `next dev` ni corrí `next build`. El comportamiento en el navegador (alta que cierra con
  toast, Editar que precarga, Cancelar, consola limpia) lo tomo de `recorrido_HU-006.md`, ronda 1, y
  coincide con lo que leí en el código.

### Dudas (no bloqueantes, ronda 2)
- Siguen abiertas las dudas de la ronda 1: la coma decimal en `type="number"`, el borrado genérico
  en Evolución y el PDF versionado con el nombre del evaluado (SDD 10.5). El orquestador las decide
  aparte.
- `onDone` es una arrow nueva en cada render de `IsakCard` y no está en las deps del efecto, que
  depende solo de `state`. Es intencional y no causa problemas porque `setMode` es estable.
