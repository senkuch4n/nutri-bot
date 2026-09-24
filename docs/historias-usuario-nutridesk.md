# Historias de usuario — funcionalidades inspiradas en NutriDesk

Análisis de [nutrideskapp.com](https://nutrideskapp.com/) comparado contra el estado actual de
NutriBot (solo turnos: bot de WhatsApp + panel con calendario/servicios). Estas historias
extienden el archivo `Histotias de usuario - NutriBot - Hoja 1.pdf` con las funcionalidades que
la nutricionista pidió evaluar. Formato: *"Yo como [rol] necesito [acción] para poder
[beneficio]"*, agrupadas por épica.

Estado de NutriBot hoy: agenda/turnos vía WhatsApp + panel. **Todo lo demás abajo es nuevo.**

## Épica 1 — Historia clínica del paciente

- Yo como profesional necesito crear una ficha clínica por paciente (antecedentes, objetivos)
  para poder tener su contexto centralizado.
- Yo como profesional necesito registrar evoluciones en la ficha del paciente para poder ver su
  progreso a lo largo del tiempo.
- Yo como profesional necesito ver gráficos automáticos de evolución (peso, medidas) para poder
  detectar tendencias sin calcular a mano.
- Yo como profesional necesito importar datos de una ficha existente (Excel/Word/PDF) para poder
  migrar mis pacientes actuales sin recargar todo manualmente.
- Yo como profesional necesito adjuntar resultados de laboratorio a la ficha para poder
  consultarlos junto con el resto del historial.

## Épica 2 — Planes nutricionales y recetas

- Yo como profesional necesito armar un plan alimenticio para un paciente para poder indicarle
  qué comer.
- Yo como profesional necesito elegir alimentos de una base con macros precalculados para poder
  armar el plan sin calcular manualmente.
- Yo como profesional necesito definir equivalencias/alternativas por grupo de alimentos para
  poder darle variedad al paciente sin rehacer el plan.
- Yo como profesional necesito generar un PDF del plan con mi logo para poder enviárselo al
  paciente de forma profesional.
- Yo como profesional necesito guardar plantillas de planes reutilizables para poder ahorrar
  tiempo con pacientes de perfil similar.
- Yo como paciente necesito ver mi plan vigente para poder seguirlo sin pedirlo por WhatsApp.

## Épica 3 — Antropometría

- Yo como profesional necesito registrar medidas antropométricas (peso, pliegues, perímetros) en
  cada consulta para poder hacer seguimiento del paciente.
- Yo como profesional necesito ver la evolución de las medidas en el tiempo para poder ajustar el
  plan según el progreso.

## Épica 4 — Cobros

- Yo como profesional necesito cobrar la consulta al momento de la reserva para poder reducir el
  ausentismo.
- Yo como profesional necesito ver un panel de pagos pendientes y facturación del mes para poder
  controlar mis ingresos sin llevar una planilla aparte.
- Yo como paciente necesito pagar la consulta o seña al reservar para poder confirmar mi turno.

## Épica 5 — Portal del paciente (web)

- Yo como paciente necesito acceder a un portal web (sin instalar nada) para poder ver mi plan,
  mi próximo turno y mi evolución sin depender de WhatsApp.
- Yo como paciente necesito registrar mi comida del día con fotos (diario alimentario) para poder
  llevar registro de lo que como.
- Yo como paciente necesito descargar los archivos que me comparte mi nutricionista (planes,
  estudios) para poder tenerlos guardados.

## Épica 6 — Comunicación masiva

- Yo como profesional necesito enviar un aviso a todos mis pacientes activos a la vez (cambio de
  horario, vacaciones) para poder comunicar sin escribir uno por uno.

## Épica 7 — Asistencia con IA

- Yo como profesional necesito pedirle a un asistente que arme una propuesta de plan a partir de
  la ficha del paciente para poder ahorrar tiempo armando planes desde cero.
- Yo como profesional necesito consultarle a un asistente datos de mi agenda o de un paciente
  puntual para poder resolver dudas rápidas sin recorrer el panel.

## Épica 8 — Confirmación de turno 3 días antes

- Yo como profesional necesito mandar un aviso automático pidiendo confirmar el turno con 3 días
  de anticipación para poder gestionar mi agenda (reprogramar si no confirman).

**Ya existe parcialmente:** hoy el bot manda un *recordatorio* informativo (`REMINDER_LEAD_HOURS`,
24hs por defecto) — no pide confirmación ni hace nada si el paciente no responde. Esta historia
extiende eso: el aviso de 3 días antes pide una respuesta sí/no, y si no confirma (o dice que no)
se avisa a la profesional para que decida (liberar el horario, llamar, etc.).

## Épica 9 — Estudios clínicos (antropometría, bioimpedancia) con gráficos relevantes

- Yo como profesional necesito ver la historia clínica de mis pacientes para ver sus avances y
  mostrárselos cuando vienen al consultorio.
- Yo como profesional necesito un gráfico comparativo de los estudios de antropometría y
  bioimpedancia de mis pacientes.

Criterios de aceptación:
- Gráficos por cada tipo de estudio que se haya hecho (bioimpedancia, antropometría, etc.).
- Cada gráfico muestra solo los datos relevantes de ESE estudio (un estudio de bioimpedancia no
  mezcla datos que no le corresponden).

**Ya existe parcialmente:** la ficha clínica (antecedentes/objetivos) y la evolución
(peso/perímetros/pliegues, con gráficos) de la Épica 1/3. Lo que falta es modelar **tipos de
estudio** con sus propios campos (ej. bioimpedancia: % grasa, % músculo, agua corporal, tasa
metabólica basal — antropometría ya cubierta) y graficar cada uno por separado, más una vista
comparativa.

## Épica 10 — Vista de dieta con datos clínicos para la profesional

- Yo como profesional necesito ver la dieta de mis pacientes para agilizar mis consultas.

Criterios de aceptación:
- En la dieta debe verse: kcal, edad del paciente, peso, hidratos de carbono, fibra.

**Ya existe parcialmente:** el plan ya muestra kcal/proteínas/carbohidratos/grasas totales. Falta:
fibra (no está en la base de alimentos hoy), edad del paciente (el modelo de paciente no tiene
fecha de nacimiento) y mostrar el peso más reciente junto al plan.

## Épica 11 — Alerta de enfermedades y alergias

- Yo como profesional necesito saber si mis pacientes presentan alguna enfermedad para no darles
  alimentos que les hagan daño.

**Ya existe parcialmente:** "Antecedentes" en la ficha clínica es texto libre. Falta destacarlo
visualmente (alerta) justo donde se arma el plan, para que no pase desapercibido armando comidas.

## Épica 12 — Diario del paciente visible para la profesional

- Yo como profesional necesito saber qué viene comiendo mi paciente cada 24hs.

**Ya existe parcialmente:** el diario alimentario con fotos existe desde la Épica 5, pero hoy solo
lo ve el paciente en el portal. Falta mostrarlo en la ficha del paciente dentro del panel.

## Épica 13 — Obras sociales

- Yo como profesional necesito que mis pacientes sepan con qué obras sociales trabajo, para no
  tener que recordarles el precio particular o con obra social en cada consulta.

## Épica 14 — Mensajes automáticos de preparación por estudio

- Yo como profesional necesito que, al agendar ciertos estudios (antropometría, bioimpedancia),
  se le manden al paciente recomendaciones automáticas antes del turno para que el estudio sea lo
  más exacto posible.

## Épica 15 — Plantilla propia de informes

- Yo como profesional necesito poder subir mi propia plantilla de informes para tener control de
  lo que les entrego a mis pacientes.

## Épica 16 — Reservas por Instagram

- Yo como profesional necesito que las personas puedan agendarme turnos por Instagram, no solo
  por WhatsApp, porque tengo gente que me escribe por ahí para sacar turno.

## Notas de alcance / dependencias externas

- Cobros (Épica 4) requiere credenciales de Mercado Pago (o el proveedor que se defina).
- Asistencia con IA (Épica 7) requiere una API key de un proveedor LLM y define costo variable
  por uso.
- Portal del paciente (Épica 5) es una superficie nueva del panel web con auth propia para
  pacientes (hoy el login del panel es solo Google, para la profesional).
- Historia clínica (Épica 1) y Antropometría (Épica 3) son la base de datos sobre la que se
  apoyan Planes (Épica 2) y el Portal (Épica 5) — conviene implementarlas primero si se van a
  encarar esas épicas.
- Reservas por Instagram (Épica 16) requiere una cuenta de Instagram profesional vinculada a una
  página de Facebook, una app en Meta for Developers, y permisos de la API de mensajería de
  Instagram — es un desarrollo del tamaño del bot de WhatsApp actual, no una extensión chica.
- Plantilla propia de informes (Épica 15) tiene alcances muy distintos según qué tan literal sea
  "subir mi plantilla": desde elegir colores/logo/textos del PDF actual, hasta subir un
  Word/PDF propio y que el sistema rellene los datos ahí adentro (mucho más complejo).

---

# Ronda 2 (2026-09-23) — cálculo nutricional, SARA 2 y paridad con NutriDesk

Lluvia de ideas **iterativa**: se agrega todo y se va depurando. Nada de esto está afinado; cada
épica pasa por el afinador recién cuando se la elige.

Fuentes:
- `docs/FORMULAS CALORICAS.docx` — fórmulas que usa la nutricionista (TMB, GET, objetivo, macros,
  peso ideal/ajustado, IMC, cintura, ICC, Deurenberg).
- `docs/tabla-composicion-quimica-alimentos-argentina_ennys2__.pdf` — Tabla SARA 2 (Ministerio de
  Salud, 2022): ~1000 alimentos, 26 grupos (Guías Alimentarias), 39 nutrientes cada 100 g de
  porción comestible, versiones crudas y cocidas.
- Pedido de la nutricionista: una vez obtenidos los gramos de cada macro de un alimento,
  kcal = carbohidratos × 4 + proteínas × 4 + grasas × 9 (SARA 2 usa los mismos factores, sobre
  carbohidratos *disponibles*, y 7 kcal/g para alcohol).
- Pedido de la nutricionista: tener "muchas o casi todas" las funcionalidades de NutriDesk.

**Restricción de alcance:** la nutricionista atiende **solo adultos**. Nada de percentiles
pediátricos ni fórmulas de embarazo/lactancia.

**Permiso de reestructurar:** el proyecto recién empieza; se puede rehacer modelos existentes
(`Food`, `EvolutionEntry`, `Professional`) si la HU lo justifica.

## Paridad con NutriDesk

| Funcionalidad NutriDesk | NutriBot hoy | Épica |
|---|---|---|
| Historia clínica (antecedentes, evolución, objetivos) | Sí | 1 |
| Laboratorios con extracción de valores por IA | No | 35 |
| Importación de fichas con IA (Excel/Word/PDF/fotos) | No | 36 |
| Portal del paciente (plan, diario con foto, archivos, evolución) | Parcial | 5, 28 |
| Reserva online 24/7 desde un link | Solo por WhatsApp | 32 |
| Google Calendar | Sí | — |
| Google Meet / teleconsulta | No | 33 |
| Recordatorios por mail y WhatsApp | Solo WhatsApp | 34 |
| Bloqueos y tipos de consulta | Sí (disponibilidad, servicios) | — |
| Base de +2000 alimentos con macros | Base chica propia | 20 |
| Equivalencias por grupo | No | 24 |
| Plantillas de plan | Sí | 2 |
| PDF con logo | Sí | 2, 15 |
| Plan con IA (plan + menú semanal + nutrientes) | Parcial (propuesta de plan) | 7, 40 |
| Antropometría (pliegues, perímetros, índices) | Parcial (sin índices) | 3, 19 |
| Bioimpedancia + import PDF InBody/BIA | Carga manual | 9, 37 |
| Mediciones bilaterales | No | 31 |
| Seguimiento bariátrico (%TWL, %EWL, reganancia) | No | 38 |
| Cobro con Mercado Pago (seña, total, transferencia) | Parcial (modelo `Payment`) | 4 |
| Tarifas por tipo de consulta | Sí (servicios) | — |
| Equipo / varios profesionales con permisos | No (una sola profesional) | 41 |
| Asistente IA 24/7 (agenda, pacientes, números) | Parcial | 7 |
| Notas de consulta grabadas, transcriptas y resumidas por IA | No | 39 |
| Difusiones por portal y mail | Solo WhatsApp | 6, 42 |

## Épica 17 — Datos del paciente para cálculos

> **Estado: CERRADA** — convertida en HU-001 y aprobada (2026-09-24). Ver `progress/history.md`.

- Yo como profesional necesito registrar el sexo, el nivel de actividad física, el objetivo
  (bajar, mantener, subir) y la contextura del paciente para poder aplicar las fórmulas de
  requerimiento sin pedirle los datos de nuevo en cada consulta.

Notas: `Patient` ya tiene `birthDate` (edad) pero no sexo. Peso, talla y % de grasa salen de la
última medición. Base de las épicas 18, 19 y 23.

## Épica 18 — Calculadora de requerimiento energético

> **Estado: CERRADA** — convertida en HU-004 y aprobada (2026-09-24). Ver `progress/history.md`.

- Yo como profesional necesito calcular la TMB con Mifflin-St Jeor, Harris-Benedict,
  Katch-McArdle y Cunningham lado a lado para poder elegir la más adecuada a cada paciente.
- Yo como profesional necesito aplicar el factor de actividad (1.2 a 1.9) y el ajuste por
  objetivo (déficit −15/−30%, mantenimiento, superávit +10/+20%) para poder obtener el VCT.
- Yo como profesional necesito repartir el VCT en macros (% del VCT o proteínas en g/kg) para
  poder tener los gramos objetivo de cada macronutriente por día.
- Yo como profesional necesito guardar la prescripción con fecha para poder ver cómo cambió el
  requerimiento indicado a lo largo del tratamiento.

Notas: lógica pura en `packages/core` con tests. Katch-McArdle y Cunningham requieren % de grasa
(bioimpedancia o Deurenberg). Duda para la nutricionista: ¿fórmula por defecto?

## Épica 19 — Diagnóstico antropométrico automático

> **Estado: CERRADA** — convertida en HU-004 y aprobada (2026-09-24). Ver `progress/history.md`.

- Yo como profesional necesito ver automáticamente IMC con su clasificación OMS, riesgo por
  circunferencia de cintura, índice cintura/cadera y % de grasa estimado (Deurenberg) para poder
  diagnosticar sin calcular a mano.
- Yo como profesional necesito ver el peso ideal (Devine, Hamwi con contextura, Broca,
  Broca-Brugsch, Lorentz) y que el sistema me sugiera usar peso ajustado cuando el peso real
  supera el 120–130% del ideal para poder no sobreestimar el gasto en pacientes con obesidad.

Notas: el Word repite la sección de peso ajustado (secciones 5, 6 y 8) y numera dos veces la
sección 7; confirmar con la nutricionista que es la misma fórmula y qué umbral usa (120 o 130%).

## Épica 20 — Base de alimentos argentina (SARA 2)

> **Estado: CERRADA** — convertida en HU-005 y aprobada (2026-09-24). Ver `progress/history.md`.

- Yo como profesional necesito una base con los alimentos de la tabla SARA 2 para poder armar
  planes con datos oficiales argentinos sin cargar alimentos a mano.
- Yo como profesional necesito que las kcal de cada alimento y de cada porción se calculen como
  CHO × 4 + proteínas × 4 + grasas × 9 y ver ese desglose para poder explicarle al paciente de
  dónde salen las calorías.
- Yo como profesional necesito cargar alimentos propios (por ejemplo productos de marca con su
  etiqueta) marcados con su fuente para poder completar lo que la tabla no tiene.

Notas: reemplaza el enum `FoodGroup` (9 grupos) por los 26 grupos de SARA 2. Decidir qué
nutrientes van como columnas (macros, fibra, sodio, azúcar agregado, saturadas, colesterol) y
cuáles aparte. Pedir a la nutricionista el link que mencionó: si es Excel/CSV, la importación es
confiable; parsear el PDF es frágil (nombres en dos renglones, columnas partidas).

## Épica 21 — Crudo/cocido, peso bruto/neto y medidas caseras

- Yo como profesional necesito indicar cantidades en crudo o en cocido y que el cálculo use la
  composición correcta para poder no errar las calorías del plan.
- Yo como profesional necesito usar medidas caseras (taza, cucharada, unidad mediana) que se
  conviertan a gramos para poder darle al paciente indicaciones que pueda seguir sin balanza.

## Épica 22 — Recetas y preparaciones

- Yo como profesional necesito armar recetas con varios ingredientes y su rendimiento para poder
  usarlas en el plan como un alimento más con sus nutrientes calculados.

## Épica 23 — Plan contra objetivo (adecuación)

- Yo como profesional necesito ver, mientras armo el plan, cuánto llevo contra el objetivo
  (kcal, proteínas, carbohidratos, grasas, fibra) con el % de adecuación para poder ajustar sin
  hacer cuentas.
- Yo como profesional necesito ver el reparto del VCT por comida (desayuno, almuerzo, etc.) para
  poder distribuir la energía del día.
- Yo como profesional necesito que el PDF del plan muestre el VCT y el reparto de macros para
  poder entregarle un resumen al paciente.

Notas: depende de 18 y 20. Extiende la Épica 10.

## Épica 24 — Intercambios y equivalencias

- Yo como profesional necesito que el sistema proponga reemplazos equivalentes ("100 g de arroz
  equivalen a X g de fideos") manteniendo kcal o el macro principal para poder dar variedad sin
  rehacer el plan.
- Yo como paciente necesito ver en el portal las alternativas de cada comida para poder cambiar
  sin consultar.

Notas: estaba en la Épica 2 y no se implementó.

## Épica 25 — Alertas por patología al armar el plan

- Yo como profesional necesito que, según las patologías y alergias del paciente, el plan me
  alerte sobre nutrientes o alimentos problemáticos (sodio en hipertensión, azúcar agregado en
  diabetes, alimentos marcados en alergias/celiaquía) para poder evitar errores.

Notas: extiende la Épica 11. Requiere patologías estructuradas (no solo texto libre) y marcas
manuales en alimentos (SARA 2 no informa gluten).

## Épica 26 — Micronutrientes contra recomendaciones

- Yo como profesional necesito ver el aporte de sodio, calcio, hierro y otros micronutrientes del
  plan contra la recomendación para adultos para poder detectar déficits o excesos.

Notas: necesita una tabla de recomendaciones (DRI) para adultos por sexo y edad.

## Épica 27 — Recordatorio de 24 hs y análisis de ingesta

- Yo como profesional necesito cargar en la consulta lo que comió el paciente el día anterior y
  ver kcal y macros contra su requerimiento para poder evaluar su alimentación real.

Notas: es el uso para el que se construyó SARA 2 (ENNyS 2).

## Épica 28 — Diario estructurado en el portal

- Yo como paciente necesito registrar lo que como eligiendo alimentos y porciones (además de la
  foto) para poder llevar un registro más preciso.
- Yo como profesional necesito decidir por paciente si ve las calorías en su diario para poder
  cuidar a pacientes con conductas alimentarias de riesgo.

Notas: extiende las épicas 5 y 12.

## Épica 29 — Lista de compras

- Yo como paciente necesito una lista de compras semanal generada desde mi plan para poder
  organizarme en el súper.

## Épica 30 — La consulta como entidad central (reestructura)

> **Estado: CERRADA** — convertida en HU-003 y aprobada (2026-09-24). Ver `progress/history.md`.

- Yo como profesional necesito que cada turno atendido genere una consulta que agrupe
  mediciones, cálculo de requerimiento, plan indicado y notas para poder ver cada visita completa
  en un solo lugar.

Notas: hoy esas piezas están sueltas en el paciente. Evaluar antes de 18/23 si se decide
reestructurar primero.

## Épica 31 — Estudios por tipo y mediciones bilaterales

- Yo como profesional necesito registrar perímetros y pliegues de ambos lados (brazo, muslo,
  pantorrilla) para poder detectar asimetrías.

Notas: complementa la Épica 9 (separar `EvolutionEntry` en antropometría y bioimpedancia).

## Épica 32 — Reserva online desde un link

- Yo como paciente necesito reservar un turno desde un link web a cualquier hora para poder
  agendarme sin escribir por WhatsApp.

Notas: reusa la disponibilidad y los servicios que ya usa el bot.

## Épica 33 — Teleconsulta

- Yo como profesional necesito que los turnos virtuales generen un link de Google Meet que se le
  mande al paciente para poder atender a distancia.

## Épica 34 — Recordatorios por mail

- Yo como paciente necesito recibir recordatorios y confirmaciones por mail, además de WhatsApp,
  para poder enterarme aunque no use WhatsApp.

## Épica 35 — Laboratorios con extracción por IA

- Yo como profesional necesito subir el PDF o la foto de un análisis de laboratorio y que se
  extraigan los valores (glucemia, colesterol, etc.) a la ficha para poder graficarlos y
  compararlos sin tipearlos.

Notas: extiende "adjuntar resultados de laboratorio" de la Épica 1.

## Épica 36 — Importación de fichas con IA

- Yo como profesional necesito importar fichas existentes (Excel, Word, PDF o fotos) y que la IA
  las convierta en pacientes, antecedentes y mediciones para poder migrar mi consultorio rápido.

Notas: extiende la Épica 1.

## Épica 37 — Importar el PDF de bioimpedancia

- Yo como profesional necesito subir el PDF de la balanza (InBody u otra BIA) y que se carguen
  solos los valores para poder no transcribirlos.

## Épica 38 — Seguimiento bariátrico

- Yo como profesional necesito ver %TWL (pérdida de peso total) y %EWL (pérdida del exceso de
  peso) y una alerta de reganancia en pacientes operados para poder seguir su evolución
  postquirúrgica.

## Épica 39 — Notas de consulta por IA

- Yo como profesional necesito grabar la consulta y que se transcriba y resuma en la ficha para
  poder concentrarme en el paciente y no en tomar notas.

Notas: requiere consentimiento del paciente y proveedor de transcripción; datos sensibles de
salud.

## Épica 40 — Plan y menú semanal con IA

- Yo como profesional necesito que la IA proponga un menú semanal que respete el VCT, los macros
  objetivo y las patologías del paciente, con los nutrientes calculados, para poder partir de un
  borrador ya balanceado.

Notas: extiende la Épica 7; depende de 18, 20 y 23.

## Épica 41 — Equipo y varios profesionales (DESCARTADA 2026-09-23: la nutricionista trabaja sola)

- Yo como profesional necesito sumar colaboradores (otra nutricionista, secretaria) con permisos
  distintos para poder delegar la agenda o compartir pacientes.

Notas: reestructura grande — hoy `Professional` es una fila única (`id = 1`). Decidir pronto si
va a hacer falta, porque condiciona el diseño de todo lo demás.

## Épica 42 — Difusiones por portal y mail

- Yo como profesional necesito que los avisos masivos también lleguen por el portal y por mail
  para poder alcanzar a los pacientes que no usan WhatsApp.

Notas: extiende la Épica 6.

## Épica 43 — Contextura sugerida por la medición de muñeca

- Yo como profesional necesito registrar la circunferencia de muñeca en la antropometría y que el
  sistema sugiera la contextura (índice r = talla / muñeca) para poder no elegirla a ojo.

Notas: surge de la HU-001 (D5); la nutricionista hace antropometría.

## Orden sugerido (a revisar)

1. Épica 17 — datos del paciente (chica, destraba el resto).
2. Épica 18 + 19 — calculadora y diagnóstico (lo que más pidió la nutricionista).
3. Épica 20 — SARA 2 (reestructura `Food`).
4. Épica 23 — plan contra objetivo.
5. Épica 21, 24, 22, 25 — precisión y usabilidad del plan.
6. Épica 30 — consulta como entidad central (o antes, si se decide reestructurar primero).
7. Resto de paridad NutriDesk según prioridad de la nutricionista (32 y 35 parecen las de más
   valor).

## Preguntas abiertas para la nutricionista

1. El link de la tabla: ¿es un Excel/CSV descargable?
2. ¿Qué fórmula de TMB usa por defecto? ¿Elige por paciente?
3. ¿Qué nutrientes quiere ver además de macros y fibra?
4. ¿Indica cantidades en crudo o cocido? ¿Usa medidas caseras?
5. ¿El paciente debería ver las calorías en el portal?
6. ~~¿Va a trabajar con otros profesionales o secretaria (Épica 41)?~~ No: trabaja sola.
7. ¿Atiende pacientes bariátricos (Épica 38)? ¿Hace teleconsulta (Épica 33)?
8. ¿Qué umbral usa para pasar a peso ajustado: 120% o 130% del peso ideal?

---

# Ronda 3 (2026-09-24) — informe antropométrico y datos del consultorio

Fuentes (provistas por la nutricionista):
- `docs/EJEMPLO DE INFORME ANTROPOMETRICO.pdf` — informe real de 6 páginas que hoy arma en Canva.
- `docs/INFORMACIÓN APP PROVISTA POR LA NUTRICIONISTA.pdf` — plus por obra social, precios
  particulares, horarios, política de seña, recordatorios y mensajes para pacientes.

Datos del consultorio que aparecen: **Lic. Daiana Ponce, M.P. 852**.

## Épica 44 — Antropometría completa (protocolo ISAK)

> **Estado: CERRADA** — convertida en HU-006 y aprobada (2026-09-24). Ver `progress/history.md`.

- Yo como profesional necesito registrar la antropometría completa que hago en consulta para
  poder calcular composición corporal, somatotipo e índices sin planillas aparte.

Qué mide hoy (según el informe) y no está en el modelo (`EvolutionEntry` tiene solo 3 pliegues y 5
perímetros):
- **Pliegues (mm):** tríceps, subescapular, supraespinal, abdominal, muslo medio, pierna
  (sumatoria de 6), bíceps y cresta ilíaca.
- **Perímetros (cm):** brazo relajado, brazo flexionado y contraído, muslo medio, pierna, cintura
  y cadera.
- **Calculados:** perímetros corregidos (perímetro − π × pliegue: brazo, muslo y pierna),
  sumatoria de 6 pliegues, IMC con clasificación OMS e índice cintura/cadera.
- Para somatotipo y fraccionamiento hacen falta **diámetros óseos** (húmero, fémur, etc.) que el
  informe no muestra: confirmar cuáles toma.

Notas: la Épica 31 (estudios por tipo, bilaterales) y la Épica 9 se solapan con esta; conviene
unificarlas al afinar. Reestructura `EvolutionEntry`, así que va junto con (o después de) la
Épica 30 (la consulta como entidad central).

## Épica 45 — Composición corporal, somatotipo e índices

> **Estado: CERRADA** — convertida en HU-006 y aprobada (2026-09-24). Ver `progress/history.md`.

- Yo como profesional necesito que el sistema calcule la composición corporal en 4 componentes
  (adiposo, muscular, óseo y residual, en % y en kg) con la referencia **ArgoRef (Holway, 2005)**
  para poder no calcularla a mano.
- Yo como profesional necesito el **somatotipo de Heath-Carter** (endomorfia, mesomorfia,
  ectomorfia) con su **somatocarta** para poder clasificar el biotipo del paciente.
- Yo como profesional necesito el **índice adiposo muscular** y el **índice músculo óseo (IMO)**
  con su categoría (p. ej. "muy alto", "medio") y la **distribución adiposa** (superior, central,
  inferior) y **muscular** (brazo, muslo, pierna) en % para poder evaluar la evolución.

Notas (2026-09-24): **hoy calcula esto con ISAKMetry** (software oficial de ISAK). Hay un
ejemplo de su exportación en `docs/ISAKMetry_*.pdf` (7 páginas) y `docs/ISAKMetry_*.xlsx` (valores,
casi sin fórmulas). Qué dice:
- **Mediciones:** masa, talla, talla sentado, envergadura; 8 pliegues (tríceps, subescapular,
  bíceps, cresta ilíaca, supraespinal, abdominal, muslo, pierna); 6 perímetros (brazo relajado,
  flexionado y contraído, cintura, caderas, muslo medio, pierna); **3 diámetros (húmero,
  biestiloideo, fémur)**.
- **Referencias con nombre:** masa grasa por Durnin-Womersley (1974); tejido adiposo por Kerr
  (1991), muscular por Lee (2000) y óseo por Rocha (1974), y residual por diferencia; puntuación Z
  contra el **Phantom** (Ross y Wilson); somatotipo de Heath-Carter.
- **Índices con su tabla:** IMO (<2,34 muy bajo; 2,34–2,44 bajo; 2,44–3,11 medio; 3,11–3,29
  alto; >3,29 muy alto), índice adiposo muscular, perímetros corregidos con Z, sumatoria de 6 y 8
  pliegues, índice córmico, Manouvrier, envergadura relativa, y de salud: ICC, índice de
  conicidad, cintura/talla, IMC e índice de distribución grasa.
- **Ojo:** el informe de Canva cita "ArgoRef, Holway (2005)", pero ISAKMetry usa Kerr/Lee/Rocha.
  Confirmar con ella cuál vale.
Dos caminos a decidir: Dos
caminos a decidir: (a) replicar los cálculos en `packages/core` (las fórmulas son publicadas y están
nombradas), usando las exportaciones de ISAKMetry como casos de prueba con los números exactos, o
(b) importar el Excel que exporta ISAKMetry, sin recalcular. Recomendado: (a) + (b) para migrar el
historial.
Si se replica: lógica pura en `packages/core` con tests. Pedir a la nutricionista las fórmulas exactas y
las tablas de referencia que usa (ArgoRef, categorías de los índices, fórmula de distribución
adiposa/muscular). Sin eso no se puede validar el cálculo.

## Épica 46 — Informe antropométrico automático (PDF)

> **Estado: CERRADA** — convertida en HU-007 y aprobada (2026-09-24). Ver `progress/history.md`.

- Yo como profesional necesito generar el informe antropométrico en PDF comparando la medición
  actual con la anterior para poder entregárselo al paciente sin armarlo en Canva.

Estructura del informe real (a replicar):
1. Datos personales (nombre, edad, fecha de evaluación).
2. Mediciones (peso, talla, IMC, clasificación) de la medición anterior y la actual, con la
   diferencia ("2 kg menos").
3. Pliegues (indicadores de grasa subcutánea) y "otros pliegues", las dos mediciones lado a lado.
4. Perímetros (musculares y de grasa visceral) y perímetros corregidos, con un texto
   interpretativo.
5. Distribución adiposo-muscular: **gráfico de barras horizontales** (anterior vs. actual por
   perímetro) + figura del cuerpo con los % por zona.
6. Indicadores de salud (índice adiposo muscular, IMO, ICC) con categoría y variación comentada.
7. Composición corporal: dos tortas (actual vs. anterior) + los 4 componentes en % y kg.
8. Somatotipo: somatocarta con los dos puntos + los 3 valores y un texto.
9. Conclusiones (texto libre).
- Pie en cada página: "LIC. DAIANA PONCE M.P 852".

Notas: los textos interpretativos pueden ser borradores generados por IA que ella edita antes de
emitir (Épica 7). Depende de 44 y 45. Relacionado con la Épica 15 (plantilla propia de informes).
Estilo: el informe real usa una plantilla verde de Canva; decidir si el PDF sigue el estilo
neutro nuevo (D12 de la HU-002) o uno propio del informe.

## Épica 47 — Datos profesionales: matrícula y firma

- Yo como profesional necesito cargar mi título y matrícula ("Lic. Daiana Ponce, M.P. 852") para
  poder mostrarlos en informes, planes y el portal.

## Épica 48 — Obras sociales con plus y derivación médica

- Yo como profesional necesito cargar cada obra social con su **plus** ($5.000, $10.000, $12.000 o
  $15.000) y si **requiere derivación médica** para poder informarle al paciente cuánto paga y qué
  tiene que traer.
- Yo como paciente necesito saber, antes del turno, cuánto es el plus de mi obra social y si
  necesito derivación.

Lista actual:
- **Plus $15.000:** SCIS (derivación), Jerárquicos Salud, Avalian, Prevención Salud, Personal de
  Farmacia (derivación), Meplife, Medicus, Ciencias Económicas (derivación), Colegio de
  Escribanos (derivación), Agente de Propaganda Médica (derivación), Nobis Medical (derivación).
- **Plus $12.000:** Swiss Medical, IPS, Luz y Fuerza (derivación).
- **Plus $10.000:** Omint, Poder Judicial de la Nación (derivación), Medifé (derivación), OSUNSA
  (derivación).
- **Plus $5.000:** Avera, OSPE, Red de Seguros Médicos (derivación).
- Además: **atención con reintegro médico (se hace factura)**.

Notas: extiende la Épica 13. Hoy `Professional.acceptedInsurances` es texto libre.

## Épica 49 — Servicios, precios y horarios reales

- Yo como profesional necesito tener cargados mis servicios particulares y mis horarios reales
  para que el bot ofrezca turnos y precios correctos.

Datos:
- Primera consulta (InBody) + plan alimentario: $50.000
- Control (InBody): $35.000
- Primera consulta + antropometría: $60.000
- Antropometría: $40.000
- Control + antropometría: $60.000
- InBody: $25.000
- Horarios: lunes, miércoles y viernes de 9 a 13 y de 16 a 20; martes de 16 a 20; jueves de 9 a
  12; sábados de 10 a 13.

Notas: es **carga de datos** (servicios y disponibilidad ya existen), no código. Se hace desde el
panel o con un script aprobado por el usuario. No va al arnés.

## Épica 50 — Recordatorios según el tipo de turno

- Yo como profesional necesito que el recordatorio dependa del tipo de consulta (**control: 1
  semana antes**; **primera consulta: 2 días antes y 24 hs antes**) para poder reducir ausencias
  sin molestar de más.

Notas: hoy hay un solo `reminderLeadHours` y una confirmación 3 días antes (Épica 8). Configurable
por servicio.

## Épica 51 — Seña con saldo a favor y política de cancelación

- Yo como profesional necesito cobrar una **seña de $10.000** que se descuenta del total de la
  consulta para poder confirmar el turno.
- Si el paciente reprograma con **24 hs o más** de anticipación, la seña **queda a favor** para el
  nuevo turno. Si cancela con menos de 24 hs o no asiste, **no se reintegra**.
- Yo como paciente necesito conocer esta política al reservar.

Notas: extiende la Épica 4 (ya existe la seña con Mercado Pago, `deposits.ts`). Lo nuevo es el
saldo a favor y la regla de las 24 hs. Depende de arreglar el webhook de Mercado Pago (bloqueado
por el middleware y sin validar la firma, ver `progress/current.md`).

## Épica 52 — Motivo de consulta al reservar

- Yo como profesional necesito que el paciente escriba el motivo de consulta al reservar para
  poder preparar el turno.

## Épica 53 — Ofrecer InBody a los pacientes

- Yo como profesional necesito mandar a mis pacientes un mensaje que ofrece el análisis de
  composición corporal (InBody), con su costo, para poder sumar ese servicio.

Texto provisto por la nutricionista (en el PDF). El mensaje decía **$20.000 adicionales** y la
lista de precios dice **InBody $25.000**. **Decisión provisoria del usuario (2026-09-24): se usa
$25.000 en los dos lugares**; ella lo puede cambiar después (el precio sale del servicio, no va
fijo en el texto).

## Épica 54 — Textos reales de preparación para InBody y antropometría

- Yo como profesional necesito que los mensajes de preparación que se mandan antes del turno sean
  los míos (InBody/bioimpedancia y antropometría) para poder obtener mediciones comparables.

Notas: la Épica 14 ya envía `PREP_INSTRUCTIONS`. Esto es **reemplazar los textos** por los del
PDF, que es un cambio directo, sin arnés.

## Épica 55 — Planes e informes que hoy arma en Canva o Word

- Yo como profesional necesito generar desde la app los planes y los informes que hoy armo en
  Canva o Word para poder no duplicar el trabajo.

Notas: cubierto en parte por el PDF del plan y la Épica 46.

## Contradicción resuelta (2026-09-24)

- **Resuelto por el usuario: atiende desde los 5 años.** Queda sin efecto "solo adultos". Ver la
  Épica 56.
- El PDF dice **"Atención a partir de los 5 años de edad"**, y el alcance acordado antes era **solo
  adultos**. Si atiende chicos, las fórmulas de adultos (TMB, IMC con clasificación OMS de
  adultos, somatotipo) no alcanzan: harían falta percentiles de la OMS y otras ecuaciones. Hay que
  confirmarlo con ella.

## Épica 56 — Pacientes pediátricos (desde los 5 años)

> **Estado: CERRADA** — convertida en HU-008 y aprobada (2026-09-24). Ver `progress/history.md`.

- Yo como profesional necesito que el sistema distinga a los pacientes menores de 18 años y use
  para ellos las referencias pediátricas (IMC para la edad con puntaje Z / percentiles de la OMS,
  talla para la edad) en lugar de las fórmulas de adultos, para poder atender desde los 5 años.

Notas: surge de la Ronda 3 (el PDF dice "Atención a partir de los 5 años"). Impacta en la
calculadora (Épica 18: Mifflin, Harris-Benedict y los factores de actividad son de adultos), el
diagnóstico (Épica 19: la clasificación OMS de IMC de adultos no aplica a chicos), el informe
(Épicas 44–46) y el aviso de menor de 18 de la HU-001 (hoy dice "Las fórmulas son para adultos",
que sigue siendo cierto, pero a futuro tiene que ofrecer la alternativa pediátrica). Pedir a la
nutricionista qué ecuaciones usa en chicos (p. ej. Schofield o FAO/OMS) y qué tablas de la OMS.

## Estado de las épicas (2026-09-24)

| Épica | HU | Estado |
|---|---|---|
| 17 | HU-001 | Cerrada (aprobada y mergeada a main) |
| 18, 19 | HU-004 | Cerradas |
| 20 | HU-005 | Cerrada |
| 30 | HU-003 | Cerrada |
| 44, 45 | HU-006 | Cerradas |
| 46 | HU-007 | Cerrada |
| 56 | HU-008 | Cerrada |
| 4, 51 (seña con Mercado Pago) | HU-009 | Pendiente por decisión del usuario (sin tiempo ahora) |
