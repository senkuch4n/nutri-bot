# Review — HU-008

**Veredicto:** APPROVED

Primer intento de revisión. Rama `hu-008-pediatria-oms`, cambios sin commitear. Todo lo de abajo lo
corrí o lo leí yo. No me basé en `progress/impl_HU-008.md`.

## Verificación propia

- `npm run typecheck`: exit 0 en core, db, web y bot.
- `npm run test`: 28 archivos, **505 tests OK**.
- `./ops/harness/verify.sh`: "Arnés OK", exit 0. Tiene 1 WARN informativo por la migración
  nueva, que revisé abajo.
- `prisma migrate status` (solo lectura): 16 migraciones, "Database schema is up to date!".
- Conteos de la base (solo lectura), en este orden: EvolutionEntry, Consultation,
  OutboundMessage, Patient, NutritionPrescription. Dan `15|18|4|10|0`, iguales a los de antes de
  la HU. Hay 0 pacientes `HU-008`/`@test.invalid`, así que no quedaron datos de prueba.
- `test:confirm-flow` no se corrió (orden del orquestador).

### Tablas OMS
- **Descarga:** bajé los 8 `.xlsx` de las URLs de la SDD 4.1 con
  `download-who-lms.sh`, a una carpeta del scratchpad. Los **8 SHA-256 coinciden** con la SDD.
- **Reproducibilidad:** corrí `build-who-lms.ts` sobre una **copia** del script en el
  scratchpad, así que escribió fuera del repo. Los dos `.ts` que generó son **idénticos byte a
  byte** (`diff`) a `packages/core/src/who/who-lms-data.ts` y `who-sd-columns.test-data.ts`. La
  autoverificación dio lo mismo que reporta el implementer:
  - error máx. DE 0,0005 en la OMS 2007;
  - SD4/SD4neg: 0,001;
  - mes 60 de la OMS 2006: ≤ 0,05.
- **Parser independiente:** con Python (`zipfile` + `ElementTree`, sin usar el regex del script)
  comparé las **676 filas** L/M/S (4 tablas × 169 meses) y las columnas de DE (SD3neg…SD3 y
  SD4neg/SD4) contra los `.xlsx`: **0 diferencias**. Muestreo pedido, meses 60, 61, 96, 150 y
  228, por sexo e indicador; todos exactos. Por ejemplo, IMC/E niños del mes 150:
  `-1.7511, 17.8704, 0.1172`; T/E niñas del mes 228: `1, 163.1548, 0.04009`.
- **Origen:** no hay valores inventados. El mes 60 sale de los archivos 2006 y los meses 61 a 228
  de los 2007 "expanded".

### Fórmulas
- **Z LMS, extensión y percentil:**
  - la Z LMS y la inversa `lmsValueAtZ` son las de la OMS;
  - la extensión para |Z| > 3 (`growth-reference.ts:59-71`) usa `SD3−SD2` / `SD2neg−SD3neg`,
    como el macro de la OMS 2007. El test contra las columnas SD4/SD4neg publicadas da ±4 en las
    336 filas, así que la valida con datos oficiales;
  - el percentil es Φ con erfcc de Numerical Recipes y la Z redondeada, según D7.
- **Recálculo independiente en Python** (con `math.erfc`):
  - Tomás: −0,02 P49 y −0,26 P40;
  - mes 96: 30 kg → 1,52; 45 kg → 4,60 (directa 4,05); 18 kg → −4,42; 15 kg → −6,46; talla
    108 → −3,41;
  - Sofía: 0,10 y 0,25.

  Todo coincide.
- **Clasificación:** los bordes D4/D5 dan inclusivos donde corresponde
  (`growth-reference.ts:142-155`). Implausible es estricto: |Z| > 5 en IMC/E y > 6 en T/E.
- **Edad en meses:** `computeAgeMonths` (`patient-formula-data.ts:201-211`) usa la misma regla
  que `computeAgeYears` (nacimiento en UTC y hoy en la zona horaria). `floor(meses/12)` da los
  años en los dos casos de borde. Hay tests de zona horaria y de fin de mes.
- **Schofield 1985:** comparé los 20 coeficientes contra la publicación, en MJ × 239: M 3–10,
  M 10–18, F 3–10 y F 10–18, variantes P y P+T. Coinciden con la forma en kcal que se usa en
  clínica. Hay dos redondeos de la literatura, ver Dudas. Las bandas son 3 ≤ edad < 10 y
  10 ≤ edad < 18. Tomás da 1365,64/1371,30 y Sofía 1014,09/1019,524; los recalculé.
- **Tests no circulares:**
  - las filas y los valores esperados van escritos en el test;
  - las DE se comparan contra las columnas publicadas, no contra la fórmula misma;
  - en los `*.test.ts` existentes, `git diff` no muestra **ninguna línea borrada**. Solo se
    agregaron casos y `population: "ADULT"` en `ana`/`luis`.

### Migración
- El SQL es exactamente el de la SDD 3.2: 2 `ADD VALUE`, 2 columnas nullable y 3
  `DROP NOT NULL`. No tiene DROP de tabla, columna o tipo, ni `SET NOT NULL` ni RENAME. No hay
  pérdida de datos. Es coherente con `schema.prisma` (diff 11+/7−).
- **Adultos siguen exigiendo Mifflin, HB y Devine en el código:**
  - en ADULT, `calculateRequirement` siempre calcula `devineIdealWeightKg`, `mifflinStJeorBmr` y
    `harrisBenedictBmr`, que no son nulos (`energy-requirement.ts:543-547`, `585-592`);
  - el snapshot solo se arma sin errores;
  - hay un test nuevo "adulto: Schofield en null en el snapshot" con Mifflin 1347.

### Adultos sin cambios
- `buildAnthropometricDiagnosis` en ADULT solo suma `ageGroup` y `pediatric: null`.
- La calculadora de adultos:
  - mismas fórmulas y mismo error `bodyFatNeeded`;
  - ayudas de macros idénticas ("15–25 %", "20–35 %", "45–60 %", "1,2–2,2 g/kg");
  - paso de peso con guard, sin `!`.
- `isakReportSourceKey` solo agrega `ageMonths` en PEDIATRIC; hay un test que prueba que la
  huella de adultos no cambia.

### Formularios
- La HU no agrega ningún `confirm`. El guardado sigue con `onClick` + `startTransition`, y el
  único `useConfirm` es el de `requirement-section.tsx`, que no se tocó y queda fuera de la
  transición.
- Las `key` nuevas o tocadas son valores de enum o constantes (`f.value`, `r.key`).

### Script de recorrido `hu008-walkthrough.ts`
- Borra solo por ids propios (`id in` / `patientId in` de pacientes propios / `consultationId in`
  de consultas propias).
- Antes de borrar, chequea que `OutboundMessage` esté vacío para sus jids `@test.invalid`.
- No importa Baileys ni `whatsapp.ts`, y no crea turnos.
- Las funciones de dominio que usa (`createManualConsultation`, `addEvolutionEntryToConsultation`,
  `createIsakStudy`) no encolan mensajes: hice grep de `outboundMessage` en esos módulos y no hay
  coincidencias.

### PDF (C4)
- Rendericé el caso 10.5 (menor pediátrico) con `renderAnthropometricReportPdf` desde una copia
  ESM en el scratchpad, con cwd `apps/web` para que cargue Inter.
- `pdftotext` muestra:
  - "IMC para la edad (OMS 2007): 17,8 · Normal (Z −0,02, P49)" y el anterior "(Z +0,17, P57)";
  - "Talla para la edad (OMS 2007): 150,0 cm · Talla adecuada (Z −0,26, P40)" y el anterior
    "(Z −0,36, P36)".
- No hay números con punto decimal. El PNG de la página 1 no tiene cortes ni desbordes.
- No quedó nada en `apps/web`: `git status` no muestra `.tmp-pdf-test`.

## Checkpoints
- C1 `backlog.json` válido, ≤ 1 HU activa: [x]. Lo chequea `verify.sh`, que da OK.
- C1 `progress/current.md` refleja la HU: [x]. Es del orquestador y está fuera del diff.
- C1 `verify.sh` exit 0: [x]
- C2 `docs/hu-pediatria-oms.md` completo, con Resoluciones D1–D18: [x]
- C2 `Refactorizaciones/pediatria-oms.md`, con workspaces, checklist y contrato: [x]
- C2 las firmas y los nombres coinciden con el Contrato compartido (5.1–5.7, 7.1): [x]. Hay un
  agregado interno, `diagnosis-missing-text.ts`, que la SDD 5.2 permite y que no se exporta.
- C3 lógica en core; dominio solo arma `population`; sin duplicación: [x]
- C3 schema/domain → web y bot compilan y los consumidores están ajustados: [x]. No quedan usos
  de `MINOR_WARNING_TEXT` en web, y el bot no tiene cambios y compila.
- C3 migración coherente, sin pasos destructivos y sin `NOT NULL` nuevos: [x]
- C3 rutas protegidas / portal: [x]. No hay rutas nuevas.
- C3 bot en silencio y textos: [x]. No se toca el bot ni hay mensajes nuevos.
- C3 sin `console.log` de debug ni TODOs: [x]. Los `console.log` del script de recorrido y del
  build son salida intencional.
- C4 typecheck limpio: [x]
- C4 lógica nueva con tests y `npm run test` en verde: [x]
- C4 flujo del bot simulado: [x]. No aplica, porque no se tocó el flujo del bot.
- C4 PDF verificado con el resultado real: [x]. Lo verifiqué yo (ver arriba).
- C5 `progress/impl_HU-008.md` describe lo tocado: [x]
- C5 `progress/review_HU-008.md` con veredicto: [x]
- C5 sin scripts sueltos ni datos de prueba en la base: [x]. `hu008-walkthrough.ts` es un
  entregable de la SDD 12.1, y la base quedó en 0 pacientes de prueba.

## Cambios requeridos (si CHANGES_REQUESTED)
Ninguno.

## Dudas (no bloqueantes)
- **Schofield en kcal:** hay dos coeficientes que difieren levemente de MJ × 239 exacto.
  - M 3–10, peso: 22,706 contra 0,095 × 239 = 22,705.
  - F 10–18, talla: 465 contra 1,948 × 239 = 465,57.

  Son los valores de la forma en kcal que se cita en clínica, y la SDD y la HU los fijan así. El
  impacto es < 1 kcal, porque la talla va en metros.
- **Test de Schofield M 8 años:** usa 1168,4719 en lugar del 1168,472 de la SDD. El desvío está
  justificado: con tolerancia 1e-6, el valor redondeado de la SDD no pasa. El valor mostrado es
  1168 igual.
- **`pediatricFooterText` con una sola fila con meses:** usa "Edad: …" con esa edad
  (`growth-reference.ts:287`). La SDD no definía el caso y la decisión es razonable.
- **Datos que el orquestador no vio en el navegador:** el guardado de la prescripción pediátrica
  y el ISAK completo del menor. Quedan cubiertos por:
  - los tests de core;
  - `test-prescriptions.ts` (según el implementer; no lo re-corrí para no escribir en la base);
  - mi render del PDF.
- **Ramas de `draftFromPrescription`:** cubren el caso de una fecha de nacimiento corregida
  entre guardar y editar. Solo el caso adulto → pediátrico tiene test.
