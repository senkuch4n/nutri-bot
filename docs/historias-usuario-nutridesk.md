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
