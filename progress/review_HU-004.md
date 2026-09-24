# Review — HU-004

**Veredicto:** APPROVED

Rama `hu-004-calculadora-requerimiento`, cambios sin commitear. Primer intento de revisión.
No revisé `backlog.json`, los `progress/*` del orquestador ni `docker-compose.prod.yml`, que no entran en este diff.

## Verificación que corrí yo
- `npm run typecheck`: exit 0 en core, db, web y bot.
- `npm run test`: 11 archivos, 218 tests OK.
- `./ops/harness/verify.sh`: exit 0, "Arnés OK". Tiró solo el WARN esperado de migración nueva, y el SQL lo revisé abajo.
- `prisma migrate status`: 12 migraciones, al día.
- Base, solo lectura: `NutritionPrescription` = 0 filas, `Consultation` = 18 (igual que antes) y 0 pacientes de prueba (`%HU-004%` / `*test.invalid`).

## Fórmulas contra `docs/FORMULAS CALORICAS.docx`
Revisé cada una en el código y todas coinciden en constantes, unidades y sexo:
- **Mifflin-St Jeor:** `energy-requirement.ts:58-60`, con +5 para hombres y −161 para mujeres.
- **Harris-Benedict:** `energy-requirement.ts:64-67`, con 88.362/13.397/4.799/5.677 para hombres y 447.593/9.247/3.098/4.330 para mujeres.
- **Katch-McArdle y Cunningham:** `energy-requirement.ts:70-82`, con 370 + 21.6·masa magra y 500 + 22·masa magra; la masa magra es peso·(1 − %/100).
- **Peso para las fórmulas:** Mifflin y Harris-Benedict usan `weightUsedKg`. Katch-McArdle y Cunningham usan la masa magra del peso actual (`energy-requirement.ts:418`), como pide la HU.
- **GET y VCT:** GET = TMB × factor y VCT = GET × (1 + ajuste/100). Los factores y rangos se reutilizan de `patient-formula-data.ts`, sin duplicarlos.
- **Macros:** proteína 4, grasa 9 y carbohidratos 4 kcal/g. Rangos de referencia 15–25 / 20–35 / 45–60 % y 1,2–2,2 g/kg.
- **Pesos ideales:** `anthropometry.ts`
  - Devine: 50 / 45,5 + 2,3·(talla − 152,4)/2,54.
  - Hamwi: 48 + 2,7 / 45,5 + 2,2 × (talla/2,54 − 60), con ±10 % por contextura tomado de `BODY_FRAMES`.
  - Broca, Broca-Brugsch (−10 % / −15 %) y Lorentz (/4 hombres, /2,5 mujeres).
- **Peso ajustado:** ideal + 0,25·(real − ideal), con umbral estricto de 130 % (D2).
- **IMC (OMS):** clasificación con el valor redondeado a 1 decimal.
- **Cintura:** riesgo con ≥ 94/102 cm en hombres y ≥ 80/88 cm en mujeres.
- **ICC:** riesgo con > 0,90 en hombres y > 0,85 en mujeres, comparación estricta (D3).
- **Deurenberg:** 1,20·IMC + 0,23·edad − 10,8·sexo − 5,4, calculado con el IMC exacto.
- **Índices de D6:** cintura/talla y conicidad, con los rangos < 0,50 y < 1,4.
- **Redondeo:** solo al mostrar o guardar.

Tests:
- Cada valor de referencia es un literal hecho a mano, con la cuenta en el nombre del test o en un comentario. Recomprobé HB de Ana (1417,1745), Katch (1384,0984), Deurenberg de Luis (37,8537), Katch de Luis con Deurenberg (1953,98) y HB de Luis con peso ajustado (1845,43).
- No encontré tests circulares. `formatMacroAmount` aparece en los tests, pero solo para formatear un valor que ya se comparó contra su literal con `toBeCloseTo`.
- Están los bordes de todas las clasificaciones: 24,9/25,0; 93,9/94; 0,85/0,86; 130,0/130,1; 130,04.

## Decisión de formato
- `formatKcalEs` no existe en ningún lugar del repo (el grep en `apps` y `packages` no devuelve nada).
- Las kcal usan `formatMacroAmount(v, "kcal")` en core (`prescriptionHeadline` y `prescriptionFormulaLine`), en la calculadora, en el resumen y en la tarjeta del Resumen.

## Checkpoints
- C1 backlog válido, con 1 HU activa como mucho: [x] (lo controla `verify.sh`, que termina en exit 0)
- C1 `progress/current.md` refleja la HU: [x]
- C1 `verify.sh` con exit 0: [x]
- C2 HU completa con Resoluciones: [x]
- C2 SDD con contrato y checklist: [x]
- C2 firmas iguales al contrato: [x] Las diferencias son deliberadas y están documentadas en impl, y ninguna rompe el contrato:
  - no hay `formatKcalEs`, por decisión del orquestador;
  - agregados aditivos: `adjustmentRangeHint`, `vctDifferenceText`, `initialAdjustmentRange`, `proteinGPerKgDecimals` y `measuredBmr.fromOtherConsultation`.
- C3 lógica pura en core y operaciones de base en db/domain, sin duplicar: [x]
  - `getFormulaMeasurementsAsOf` es la única consulta, y `getLatestFormulaMeasurements` delega en ella.
  - `belongsToPatient` se movió a `apps/web/src/lib/consultation-guard.ts` y se usa desde las dos actions.
- C3 web y bot compilan con todos los consumidores ajustados: [x] `hasPrescription` está en:
  - `domain/consultations.ts`
  - `domain/appointments.ts`
  - `api/appointments/route.ts`
  - la ficha
  - el detalle de la consulta
  - `consultations.test.ts`

  Además, las guardas de `deleteMany` suman `prescription: { is: null }`.
- C3 migración: [x] Tiene solo 5 `CREATE TYPE`, 1 `CREATE TABLE`, 1 índice único y 1 FK en cascada sobre la tabla nueva. No hay DROP ni ALTER sobre tablas o enums existentes. Los NOT NULL van en una tabla nueva y vacía. El diff de `schema.prisma` suma 82 líneas y no borra ninguna.
- C3 auth y portal: [x] No hay rutas nuevas.
  - Las server actions quedan bajo `middleware.ts`, igual que las demás del panel.
  - Las dos actions validan ids y verifican que la consulta sea del paciente (`belongsToPatient`).
  - `(portal)` no se tocó.
- C3 bot en silencio: [x] `apps/bot` no se tocó, y ni guardar ni borrar encola mensajes. El script lo comprueba con `outboundMessage.count` = 0.
- C3 sin console.log ni TODOs: [x]
- C4 typecheck limpio: [x]
- C4 tests de core con `npm run test` en verde: [x]
- C4 flujo del bot simulado: [x] No aplica, porque no se tocó el flujo del bot. `setAppointmentStatus` está cubierto por `test-prescriptions.ts` (paso 10).
- C4 PDF o documento: [x] No aplica.
- C5 `impl_HU-004.md` existe: [x]
- C5 `review_HU-004.md` con veredicto: [x]
- C5 sin datos de prueba sueltos: [x] La base quedó limpia. El script `packages/db/scripts/test-prescriptions.ts` está en "Crear" de la SDD y limpia por id (líneas 313-318).

## Puntos pedidos en especial
- **Menores de 18 (D13):**
  - `buildAnthropometricDiagnosis` devuelve solo el IMC sin clasificar y todo lo demás en null (`anthropometric-diagnosis.ts`, rama `minor`).
  - La tarjeta muestra el `Alert info` con `MINOR_WARNING_TEXT`.
  - `page.tsx` no renderiza `RequirementSection` si `diagnosis.minor`.
  - En el servidor, `getRequirementContextForConsultation` da `ctx = null` para menores y `saveConsultationPrescription` tira error.
  - La edad se calcula a la fecha de la consulta, en la zona horaria de la profesional.
- **Sin sexo:** el IMC se clasifica y Broca tiene valor. Cintura e ICC muestran el valor con "Falta sexo". Devine, Hamwi, Brugsch y Lorentz dicen "Falta sexo", y Deurenberg también. Cintura/talla y conicidad sí se calculan. En "Requerimiento" aparece el aviso de faltantes con el Sheet "Completar datos para cálculos".
- **Sin talla:** el IMC dice "Sin dato (falta talla)" y en la sección de peso ideal aparece el mismo texto.
- **Sin grasa:** Katch-McArdle y Cunningham quedan deshabilitadas con "Sin % de grasa medido". El botón "Usar el estimado de Deurenberg" las habilita con la etiqueta "estimado". Si la fórmula elegida no tiene valor, aparece el error `bodyFatNeeded` y no deja guardar.
- **D4, nunca mediciones posteriores:** el tope es `dayRangeUtc(dayKeyInTz(consultedAt, tz)).end` (`prescriptions.ts`). La propia consulta gana, y el resto se ordena por recordedAt/createdAt descendente (`formula-measurements.ts`).
- **`useConfirm`:**
  - En `requirement-section.tsx` (`handleDelete`), el `await confirm()` está fuera de toda transición, y el `startTransition` va recién después.
  - Guardar usa `onClick` + `startTransition`, sin `confirm` y sin `<form action>` en la calculadora.
- **UI:** usa solo componentes del sistema de diseño actual (`Card`, `Badge` con tonos existentes, `Alert`, `Quantity`, `Table`, `DataTable`, `ToggleGroup`, `RadioGroup`, `NumberInput`, `Field`, `Select`, `notify`). No hay colores nuevos ni tokens viejos, y `tailwind.config.ts` no se tocó.

## Dudas (no bloqueantes)
- `requirement-calculator.tsx:72` y `:217`: la columna "kcal" de la tabla de macros usa un `Intl.NumberFormat` local (`kcalNumber`) en vez de `formatMacroAmount`. Se entiende, porque la unidad ya está en el encabezado, y la salida es idéntica a la de `kcalFormat` de `nutrition.ts`. Pero es un segundo formateador de kcal. Si se quiere una sola fuente, se podría exportar el formateador desde core.
- `requirement-section.tsx`, en `PrescriptionSummary` (filas `rows`): los g/kg del resumen se calculan en web como `gramos redondeados / weightUsedKg`. La diferencia con el valor exacto es despreciable al mostrarlo con 1 decimal, pero es una cuenta mínima fuera de core.
- La fe de erratas de la SDD (157,3 % en vez del 157,4 % de la HU) es correcta: 118 / 74,99213 × 100 = 157,35.
- El recorrido del orquestador no cubrió menores, g/kg, editar y borrar ni peso ajustado > 130 %. Los cubren los tests de core y `test-prescriptions.ts`, pero no se vieron en el navegador.
