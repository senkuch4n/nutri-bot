# HU-024 · Modelo multi-tenant

Issue: #67. Rama: `feat/HU-024-modelo-multi-tenant`. Alcance: `docs/hu-modelo-multi-tenant.md`; diseño: `Refactorizaciones/modelo-multi-tenant.md`.

## Specs

- **S1** — «Cada consultorio será un tenant independiente.»
- **S2** — «Cada tenant tendrá inicialmente una profesional principal, una agenda, una conexión de WhatsApp y una cuenta de Mercado Pago para las señas.»
- **S3** — «La suscripción de Mercado Pago a Arzium pertenecerá al consultorio, no a un usuario individual.»
- **S4** — «El diseño debe permitir que en el futuro existan varios profesionales y varias agendas dentro de un mismo consultorio, sin requerir una refactorización estructural importante.» «No implementaremos múltiples agendas por consultorio en esta primera etapa.»
- **S5** — «Separar conceptualmente Tenant, User, Professional y las relaciones de pertenencia y permisos.»
- **S6** — «Priorizar el aislamiento de datos y una migración segura del sistema actual.»
- **S7** — «No ejecutes todavía migraciones sobre producción.»

## Tasks

- **T1** — Fundación aditiva y enlace de la instalación inicial. S1–S7 en la base y el modelo; sin alta de usuarios ni integraciones. Ruta: inline, verificación independiente (riesgo 1). Estado: hecho. Commit: `9ec8fc7`.
- **T2** — Propiedad, backfill y restricciones por grupo de modelos. S1–S3, S6–S7. Ruta: expansiones aditivas por grupo, inline con verificación independiente. Estado: en curso; primer corte de agenda verificado y guardado en `5e2a664`. Los demás grupos siguen pendientes.
  - **T2a** — Propiedad aditiva de la cuenta de señas, estado OAuth y metadatos de conexión WhatsApp. S1–S3, S6–S7. Ruta: worker acotado (contexto) y verificación independiente (riesgo 1). Estado: hecho. Commit: `0ee9d63`.
  - **T2b** — Propiedad de las raíces clínicas necesarias para vincular planes e informes. S1, S6–S7. Ruta: worker acotado (contexto) y verificación independiente (riesgo 1). Estado: en curso. Commit: —.
- **T3** — Contexto explícito, lectores, escritores y fixtures en panel/bot/dominio. S1–S6. Ruta: por definir después de T2. Estado: pendiente. Commit: —.
- **T4** — Aislamiento, compatibilidad y restauración verificadas en Postgres descartable. S1–S7. Ruta: verificación independiente (riesgo 1). Estado: pendiente. Commit: —.

## Log

- **L1** — Pedido original de alcance:

  Para la HU-024, vamos a definir el MVP con **una agenda profesional por consultorio**.

  La arquitectura debe contemplar lo siguiente:

  - Cada consultorio será un tenant independiente.
  - Cada tenant tendrá inicialmente una profesional principal, una agenda, una conexión de WhatsApp y una cuenta de Mercado Pago para las señas.
  - La suscripción de Mercado Pago a Arzium pertenecerá al consultorio, no a un usuario individual.
  - El diseño debe permitir que en el futuro existan varios profesionales y varias agendas dentro de un mismo consultorio, sin requerir una refactorización estructural importante.
  - No implementaremos múltiples agendas por consultorio en esta primera etapa.
  - Separar conceptualmente Tenant, User, Professional y las relaciones de pertenencia y permisos.
  - Priorizar el aislamiento de datos y una migración segura del sistema actual.

  Con estas decisiones, terminá de definir el alcance y los criterios de aceptación de HU-024.

  Una vez validado el diseño, podremos moverla a «Lista para dev» y comenzar la implementación. No ejecutes todavía migraciones sobre producción.

- **L2** — Autorización posterior, tras confirmar aislamiento: «ok, si no hay problema, continuemos».
- **L3** — Project #5 verificado en «Lista para dev». SDD cubre los 34 modelos existentes. Prisma aplicó las 27 migraciones previas en un contenedor Postgres 16 descartable; no se usó el `.env` habitual ni una base existente.
- **L4** — T1 `9ec8fc7`: RED por falta de `Tenant`; GREEN en instalación limpia y upgrade descartable. Prisma validado y regenerado, typecheck correcto, suite 2.861/2.861. Una corrección amplió la prueba a todas las columnas previas de `Professional` y filas relacionadas sintéticas; la verificación independiente pasó. Project #5 sigue «En curso». Sin push, PR ni migración fuera del sandbox.
- **L5** — T2 comienza por pacientes, agenda, servicios y turnos. El bot y el panel todavía usan selectores Prisma globales por JID; la expansión no debe quitar ese índice global antes de migrar los consumidores (T3).
- **L6** — Agenda T2: restauración de referencia, RED por columna de propiedad ausente y GREEN de backfill y enlaces cruzados en Postgres descartable; Prisma, typecheck y 2.861 tests pasaron. El verificador independiente no pudo acceder al socket de Docker y no certificó el corte. Sin commit. Project #5 Bloqueada; motivo registrado en #67.
- **L7** — Docker restablecido. En el corte de agenda pasaron también la comparación de columnas previas, las escrituras legacy, la instalación limpia y el rollback sin agenda inicial, con verificación independiente. Project #5 comprobado de nuevo en «En curso». Corte de agenda: `5e2a664`.
- **L8** — «termina con el 024»; luego «continua con el 024». Project #5 verificado en «En curso»; se retoma desde `5e2a664` y se separa el corte de integración del de agenda.
- **L9** — T2a `0ee9d63`: migración de integraciones verificada desde cero y con filas legadas en Postgres descartable. RED por falta de `tenantId`; GREEN de preservación de cifrados, restricciones y escrituras legacy. Verificador independiente exit 0, Prisma, typecheck, 2.861 tests. Sin producción, push ni PR. Antes de acotar outbox se necesita expresar ownership de planes e informes.
- **L10** — T2b ancla la propiedad de `Consultation`, `EvolutionEntry`, `NutritionPlan` y `AnthropometricReport` al dueño de sus padres existentes. Mantiene la compatibilidad de relaciones secundarias y difiere sus restricciones hasta tener ambos lados escritos con contexto.
