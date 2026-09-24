# HU-001 — Datos del paciente para cálculos nutricionales

**Como** profesional (nutricionista),
**quiero** registrar en la ficha del paciente el sexo, el nivel de actividad física, el objetivo
(bajar, mantener o subir de peso) y la contextura corporal,
**para que** las fórmulas de requerimiento y de peso ideal se puedan aplicar sin volver a pedirle
esos datos en cada consulta.

Origen: Épica 17 de `docs/historias-usuario-nutridesk.md` (Ronda 2). Es la base de las épicas 18
(calculadora TMB/GET/VCT), 19 (diagnóstico antropométrico) y 23 (plan contra objetivo).

---

## Contexto

### Qué existe hoy

- **`Patient`** (`packages/db/prisma/schema.prisma`) tiene `name`, `phone`, `whatsappJid`,
  `birthDate` (opcional, `@db.Date`) y `notes`. **No tiene sexo, actividad, objetivo ni
  contextura.**
- **Panel → paciente** (`apps/web/src/app/(panel)/pacientes/[id]/page.tsx`): en orden, tarjetas
  de turnos (`StatTile`), **"Datos"** (`patient-form.tsx`: nombre, fecha de nacimiento con el hint
  "Para calcular la edad en los planes.", notas; lo guarda `updatePatientAction` en
  `pacientes/actions.ts` con zod), **"Ficha clínica"** (`clinical-record-form.tsx`: antecedentes,
  marca de riesgo, **objetivos en texto libre** → `ClinicalRecord.goals`), "Evolución",
  "Diario alimentario", "Planes nutricionales" e "Historial de turnos".
- **Edad**: `apps/web/src/lib/age.ts` (`calculateAge`) la calcula desde `birthDate`; hoy solo se
  muestra en el detalle del plan.
- **Peso, talla y % de grasa** viven en `EvolutionEntry` (`weightKg`, `heightCm`,
  `bodyFatPercent`), todos opcionales y por medición. Ya hay un patrón para tomar "el último valor
  no nulo" de cada uno por separado (`ai-actions.ts` de la propuesta con IA y `resumenPaciente` en
  `apps/web/src/lib/assistant-tools.ts`).
- **IMC e ICC** ya se calculan en `packages/core/src/anthropometry.ts` y se ven en "Evolución",
  pero sin clasificación por sexo (eso es la Épica 19).
- **Alta de pacientes**: el bot los crea al primer mensaje con `findOrCreatePatientByJid` (solo
  JID y teléfono) y el panel con `findOrCreatePatient` al dar un turno (teléfono y nombre), ambos
  en `packages/db/domain/patients.ts`. Ninguno pide datos clínicos, y **así debe seguir**: todos
  los campos nuevos nacen vacíos.
- **Portal del paciente** (`/portal`, `/portal/plan`, `/portal/evolucion`, `/portal/diario`): no
  muestra ni edita datos personales.
- La base de desarrollo tiene pacientes cargados a mano que no tienen ninguno de estos datos.

### Qué es lo nuevo

1. Cuatro datos estructurados (listas cerradas, no texto libre) guardados en el paciente: sexo,
   nivel de actividad, objetivo y contextura.
2. Un bloque de solo lectura que junta **todo lo que van a necesitar las fórmulas**: edad (de
   `birthDate`), último peso, última talla y último % de grasa (de "Evolución", con su fecha),
   más los cuatro datos nuevos, y que marca claramente cuáles faltan.

El objetivo en texto libre de la ficha clínica (`ClinicalRecord.goals`, "qué busca lograr el
paciente") **no se reemplaza**: sigue existiendo como descripción; el objetivo nuevo es la
categoría que usan las fórmulas.

---

## Criterios de aceptación

```gherkin
Feature: Datos del paciente para cálculos

  Background:
    Given la profesional está logueada en el panel
    And existe un paciente "Ana" con fecha de nacimiento cargada

  Scenario: Cargar los datos para cálculos por primera vez
    Given "Ana" no tiene sexo, actividad, objetivo ni contextura cargados
    When la profesional abre la ficha de "Ana"
    And en "Datos para cálculos" elige sexo "Femenino", actividad "Ligero",
        objetivo "Bajar de peso" y contextura "Mediana"
    And toca "Guardar"
    Then ve la confirmación "✓ Guardado"
    And al recargar la ficha los cuatro valores siguen seleccionados

  Scenario: Los datos persisten entre consultas
    Given "Ana" tiene cargados sexo, actividad, objetivo y contextura
    When la profesional registra una nueva medición en "Evolución"
    Then los cuatro datos siguen cargados sin volver a pedirlos

  Scenario: Cambiar un dato que evolucionó
    Given "Ana" tiene actividad "Sedentario"
    When la profesional cambia la actividad a "Moderado" y guarda
    Then la ficha muestra actividad "Moderado"

  Scenario: Borrar un dato cargado por error
    Given "Ana" tiene contextura "Grande"
    When la profesional elige "Sin cargar" en contextura y guarda
    Then la contextura queda vacía y se muestra como dato faltante

  Scenario: Paciente preexistente sin datos
    Given un paciente creado antes de esta funcionalidad, sin sexo ni actividad ni objetivo ni contextura
    When la profesional abre su ficha
    Then la ficha carga sin errores
    And cada uno de los cuatro datos se muestra como "Sin cargar"
    And ve un aviso "Faltan datos para los cálculos: sexo, actividad física, objetivo, contextura"

  Scenario: Resumen de datos para fórmulas con mediciones
    Given "Ana" tiene sexo, actividad, objetivo y contextura cargados
    And tiene una medición del 10/08 con peso 68 kg y talla 162 cm
    And tiene una medición del 01/09 con peso 66,5 kg y 29,4 % de grasa, sin talla
    When la profesional abre la ficha de "Ana"
    Then el resumen muestra edad en años, peso 66,5 kg (01/09), talla 162 cm (10/08)
         y grasa 29,4 % (01/09)
    And no se muestra el aviso de datos faltantes

  Scenario: Faltan datos que vienen de otras secciones
    Given "Ana" no tiene fecha de nacimiento
    And no tiene ninguna medición con talla
    When la profesional abre la ficha de "Ana"
    Then el resumen muestra edad "Sin cargar" y talla "Sin cargar"
    And el aviso de faltantes incluye "fecha de nacimiento" y "talla"
    And el aviso indica dónde cargarlas ("Datos" y "Evolución")

  Scenario: % de grasa ausente no es un faltante bloqueante
    Given "Ana" tiene todos los datos salvo mediciones con % de grasa
    When la profesional abre la ficha de "Ana"
    Then el resumen muestra grasa "Sin dato"
    And el aviso de faltantes no menciona el % de grasa

  Scenario: Crear paciente desde el bot o desde un turno
    When un paciente nuevo escribe al bot o la profesional le da un turno desde el panel
    Then el paciente se crea como hoy, con los cuatro datos vacíos
    And el bot no le pregunta ninguno de estos datos

  Scenario: Valor inválido enviado al servidor
    When llega al guardado un nivel de actividad que no está en la lista
    Then no se guarda nada
    And la profesional ve "Datos inválidos"
```

---

## Datos que se registran

| Dato | Valores | Obligatorio | Uso |
|---|---|---|---|
| Sexo | Femenino / Masculino / *Sin cargar* | No (nullable; se marca como faltante) | Mifflin-St Jeor, Harris-Benedict, Devine, Hamwi, Broca-Brugsch, Lorentz, Deurenberg, umbrales de cintura e ICC |
| Nivel de actividad física | Sedentario (1.2) / Ligero (1.375) / Moderado (1.55) / Intenso (1.725) / Muy intenso (1.9) / *Sin cargar* | No (se marca como faltante) | Factor de actividad: GET = TMB × factor |
| Objetivo | Bajar de peso / Mantener / Subir de peso / *Sin cargar* (ver D3 por déficit moderado vs. agresivo) | No (se marca como faltante) | Ajuste sobre el GET para llegar al VCT |
| Contextura | Pequeña / Mediana / Grande / *Sin cargar* | No (se marca como faltante; ver D5) | Ajuste de Hamwi (−10 % / 0 / +10 %) |

Cada opción de actividad lleva la descripción del documento de fórmulas como ayuda visible
(p. ej. "Ligero — ejercicio ligero 1-3 días/semana").

Datos que **no** se registran en esta HU, solo se leen para el resumen:

| Dato | De dónde sale |
|---|---|
| Edad | `Patient.birthDate` (sección "Datos") |
| Peso | Última `EvolutionEntry` con `weightKg` |
| Talla | Última `EvolutionEntry` con `heightCm` |
| % de grasa | Última `EvolutionEntry` con `bodyFatPercent` (opcional: solo lo necesitan Katch-McArdle y Cunningham) |

---

## Diseño UX

Todo vive en el **panel**, en la ficha del paciente (`/pacientes/[id]`), con los componentes
actuales de `apps/web/src/components/ui.tsx` (`Card`, `SectionLabel`, `Field`, `Select`,
`Button`, `Badge`). No se toca el bot ni el portal.

### Ubicación

Una tarjeta nueva **"Datos para cálculos"** entre "Datos" y "Ficha clínica".

### Contenido de la tarjeta

1. **Aviso de faltantes** (solo si falta algo obligatorio para las fórmulas), arriba de todo, en
   tono de advertencia (no de error):
   > Faltan datos para los cálculos: sexo, contextura, talla. La talla se carga en "Evolución".

   Enumera solo lo que falta. Si falta fecha de nacimiento, dice "se carga en Datos"; si faltan
   peso o talla, "se carga en Evolución".

2. **Formulario** (grilla de 2 columnas en desktop, 1 en mobile), cuatro `Select`:
   - **Sexo** — hint: "Sexo biológico, lo usan las fórmulas de TMB y peso ideal."
   - **Actividad física** — cada opción con su factor y descripción.
   - **Objetivo** — Bajar de peso / Mantener / Subir de peso.
   - **Contextura** — Pequeña / Mediana / Grande; hint: "Ajusta el peso ideal de Hamwi."

   Cada select arranca en "Sin cargar" si el dato está vacío. Botón **"Guardar"** con el mismo
   feedback que las otras tarjetas: "Guardando…" mientras procesa, "✓ Guardado" al terminar,
   "Datos inválidos" en rojo si el servidor rechaza.

3. **Resumen de solo lectura** "Lo que van a usar las fórmulas", una fila de datos compactos:
   `Edad 34 años · Peso 66,5 kg (01/09/2026) · Talla 162 cm (10/08/2026) · Grasa 29,4 % (01/09/2026)`.
   Los faltantes se muestran como `Badge` gris "Sin cargar" (edad, peso, talla) o "Sin dato"
   (grasa, que no es bloqueante). La fecha al lado de cada medición deja ver si el dato es viejo.

### Pacientes existentes

No hay migración de datos ni valores por defecto inventados: los pacientes actuales quedan con
los cuatro campos vacíos, la ficha abre normal y el aviso de faltantes les dice qué completar.
Nada cambia para el bot ni para el portal.

---

## Fuera de alcance

- Calcular TMB, GET, VCT, macros o peso ideal (Épica 18) y el diagnóstico antropométrico
  automático con clasificaciones por sexo (Épica 19).
- Rediseño visual del panel (HU-002).
- Convertir la consulta en la entidad central (Épica 30) y guardar un historial de cambios de
  estos datos (ver D2).
- Pedirle datos al paciente por el bot o dejar que los cargue en el portal.
- Mostrar estos datos en el portal del paciente.
- Pasarle estos datos a la IA (propuesta de plan y `/asistente`) (ver D8).
- Medir la contextura (muñeca, índice r de Frisancho): acá solo se registra la categoría.
- Pacientes pediátricos: la nutricionista atiende solo adultos.
- Tocar el texto libre de objetivos de la ficha clínica.

---

## Notas de implementación

- Campos nuevos **nullable** (enums de Prisma o equivalentes), sin default, para que la migración
  no toque las filas existentes. El `architect` decide si van en `Patient` o en `ClinicalRecord`
  (este último no existe para todos los pacientes: se crea con upsert).
- Los factores (1.2 … 1.9), los rangos de objetivo y el ±10 % de contextura son **constantes de
  dominio** que va a usar la Épica 18: conviene dejarlos en `packages/core` (etiquetas + factor),
  con test, en vez de hardcodearlos en el formulario.
- El cálculo de "qué falta" también es lógica pura que va a reusar la calculadora → candidata a
  `packages/core`.
- "Última medición con X" ya se consulta en dos lugares (`ai-actions.ts`, `assistant-tools.ts`);
  si hace falta una tercera, evaluar llevarla a `packages/db/domain`.
- Cambio de schema: revisar `typecheck` de `apps/web` **y** `apps/bot` (el bot crea pacientes).
- Pruebas sobre la base de desarrollo: solo con datos propios borrados por id; no tocar pacientes
  existentes.

---

## Dudas para validar con el usuario

- **D1 — Sexo: opciones y nombre.** Las fórmulas son binarias. ¿Alcanza con Femenino / Masculino?
  ¿Cómo se trata a un paciente trans o que no quiere declararlo (se deja "Sin cargar", o se elige
  el sexo que se va a usar en las fórmulas)? ¿El campo se llama "Sexo" o "Sexo (para fórmulas)"?
- **D2 — ¿Del paciente o de la consulta?** La propuesta guarda actividad y objetivo como
  **valor actual del paciente** (se sobrescribe al cambiar) y deja el registro histórico para
  cuando la Épica 18 guarde cada prescripción con fecha, o para la Épica 30 (consulta como
  entidad). ¿Está bien, o la nutricionista necesita ya ver cómo cambiaron actividad y objetivo
  consulta a consulta? Si se decide hacer la Épica 30 antes que la 18, esto se revisa.
- **D3 — Objetivo: ¿3 o 4 opciones?** El borrador dice bajar / mantener / subir, pero el documento
  de fórmulas distingue déficit **moderado** (−15/−25 %) y **agresivo** (−25/−30 %, con
  supervisión). ¿"Bajar de peso" se divide en dos objetivos, o la intensidad del déficit (y el %
  exacto dentro del rango) se elige en la calculadora (Épica 18)? La propuesta asume lo segundo.
- **D4 — "Subir de peso" vs. "ganar masa muscular".** El documento dice "Ganancia de peso / masa
  muscular". ¿Una sola opción, o dos?
- **D5 — Contextura: ¿cómo la determina?** ¿La elige a ojo, o la mide (circunferencia de muñeca /
  índice de Frisancho)? Si la mide, ¿quiere registrar la muñeca y que el sistema sugiera la
  contextura (sería otra HU)? ¿La contextura es obligatoria para marcar la ficha como completa, o
  se puede asumir "Mediana" cuando falta (Hamwi sin ajuste)?
- **D6 — Adultos y edad.** Si la fecha de nacimiento da menos de 18 años, ¿se muestra un aviso
  ("Las fórmulas son para adultos") o no hace falta?
- **D7 — Indicador en la lista de pacientes.** ¿Quiere ver en `/pacientes` una marca de
  "datos para cálculos incompletos", o alcanza con el aviso dentro de la ficha?
- **D8 — IA.** La propuesta de plan con IA y el asistente hoy reciben objetivos en texto,
  antecedentes, peso y talla. ¿Se les suma sexo, edad, actividad y objetivo en esta HU (cambio
  chico), o queda para después?
- **D9 — Ubicación.** ¿Tarjeta propia "Datos para cálculos" (propuesta) o campos dentro de "Datos"
  o de "Ficha clínica"?
- **D10 — Antigüedad de las mediciones.** El resumen toma el último peso, talla y % de grasa por
  separado, aunque sean de fechas distintas (se muestra la fecha de cada uno). ¿Está bien, o
  quiere un aviso cuando el peso tiene más de N meses?

---

## Resoluciones (validadas por el usuario, 2026-09-23)

Estas resoluciones **mandan sobre el texto de arriba** donde haya diferencia.

- **D1:** el campo se llama **"Sexo (para fórmulas)"**, con opciones Femenino / Masculino / Sin
  cargar. Para pacientes trans o que no lo declaran, la profesional elige cuál usar en las
  fórmulas.
- **D2:** actividad y objetivo son el **valor actual del paciente** (se sobrescriben). El historial
  llega con la HU-003 (consulta como entidad central).
- **D3:** "Bajar de peso" es una sola opción; la intensidad del déficit se elige en la calculadora
  (Épica 18).
- **D4:** **"Subir de peso" y "Ganar masa muscular" son dos opciones distintas.** Objetivo queda:
  Bajar de peso / Mantener / Subir de peso / Ganar masa muscular / Sin cargar.
- **D5:** la contextura se elige a mano (Pequeña / Mediana / Grande). **No es un faltante
  bloqueante:** si falta, las fórmulas asumen Mediana, y el resumen lo indica ("Sin cargar, se
  asume Mediana"). Nota: la nutricionista hace antropometría, así que en el futuro puede medir la
  muñeca y el sistema sugerir la contextura (idea anotada como épica aparte, fuera de alcance).
- **D6:** si la edad da menos de 18 años, se muestra un aviso: "Las fórmulas son para adultos".
- **D7:** sin indicador en la lista de pacientes; alcanza con el aviso dentro de la ficha.
- **D8:** **entra en esta HU**: la propuesta de plan con IA y el asistente reciben también sexo,
  edad, actividad física y objetivo.
- **D9:** tarjeta propia "Datos para cálculos", entre "Datos" y "Ficha clínica".
- **D10:** sin aviso de antigüedad; se muestra la fecha de cada medición.
