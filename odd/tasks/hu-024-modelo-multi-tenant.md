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

- **T1** — Fundación aditiva y enlace de la instalación inicial. S1–S7 en la base y el modelo; sin alta de usuarios ni integraciones. Ruta: inline, verificación independiente (riesgo 1). Estado: en curso. Commit: —.
- **T2** — Propiedad, backfill y restricciones por grupo de modelos. S1–S3, S6–S7. Ruta: por definir después de T1. Estado: pendiente. Commit: —.
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
