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

## Notas de alcance / dependencias externas

- Cobros (Épica 4) requiere credenciales de Mercado Pago (o el proveedor que se defina).
- Asistencia con IA (Épica 7) requiere una API key de un proveedor LLM y define costo variable
  por uso.
- Portal del paciente (Épica 5) es una superficie nueva del panel web con auth propia para
  pacientes (hoy el login del panel es solo Google, para la profesional).
- Historia clínica (Épica 1) y Antropometría (Épica 3) son la base de datos sobre la que se
  apoyan Planes (Épica 2) y el Portal (Épica 5) — conviene implementarlas primero si se van a
  encarar esas épicas.
