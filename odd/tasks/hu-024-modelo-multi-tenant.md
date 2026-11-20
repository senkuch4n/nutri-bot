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
- **S8** — «Los alimentos oficiales de SARA2 y sus valores nutricionales serán compartidos.»
- **S9** — «Cada consultorio tendrá sus propias preferencias de visibilidad de alimentos.»
- **S10** — «Las medidas caseras personalizadas serán independientes por tenant.»
- **S11** — «Los alimentos creados manualmente por una nutricionista pertenecerán exclusivamente a su consultorio.»
- **S12** — «Las recetas, planes nutricionales y demás datos clínicos deberán permanecer completamente aislados.»
- **S13** — «Una modificación realizada por un consultorio nunca deberá alterar los datos ni las preferencias de otro.»
- **S14** — «Los nuevos consultorios deberán visualizar el catálogo oficial completo por defecto.»
- **S15** — «La migración deberá conservar las personalizaciones existentes, asociándolas únicamente al consultorio original.»
- **S16** — «Evitar duplicar innecesariamente el catálogo oficial en PostgreSQL.»
- **S17** — «Implementá el modelo de datos necesario para estas reglas, respetando el diseño actual y evitando romper las referencias de alimentos utilizadas por planes y recetas existentes.»
- **S18** — «Incluí pruebas de aislamiento entre al menos dos consultorios y verificá que la actualización del catálogo SARA2 no sobrescriba las personalizaciones privadas.»
- **S19** — «No ejecutes migraciones en producción ni realices push o merge sin autorización.»

## Tasks

- **T1** — Fundación aditiva y enlace de la instalación inicial. S1–S7 en la base y el modelo; sin alta de usuarios ni integraciones. Ruta: inline, verificación independiente (riesgo 1). Estado: hecho. Commit: `9ec8fc7`.
- **T2** — Propiedad, backfill y restricciones por grupo de modelos. S1–S3, S6–S7. Ruta: expansiones aditivas por grupo, inline con verificación independiente. Estado: en curso; primer corte de agenda verificado y guardado en `5e2a664`. Los demás grupos siguen pendientes.
  - **T2a** — Propiedad aditiva de la cuenta de señas, estado OAuth y metadatos de conexión WhatsApp. S1–S3, S6–S7. Ruta: worker acotado (contexto) y verificación independiente (riesgo 1). Estado: hecho. Commit: `0ee9d63`.
  - **T2b** — Propiedad de las raíces clínicas necesarias para vincular planes e informes. S1, S6–S7. Ruta: worker acotado (contexto) y verificación independiente (riesgo 1). Estado: hecho. Commit: `d22c3d0`.
  - **T2c** — Propiedad del outbox y validación de referencias a turno, plan e informe. S1, S6–S7. Ruta: worker acotado (contexto) y verificación independiente (riesgo 1). Estado: hecho. Commit: `99e151b`.
  - **T2d** — Catálogo oficial compartido y preferencias, medidas y alimentos propios por tenant, preservando referencias e importación. S6–S11, S13–S19. Ruta: worker acotado y verificación independiente (riesgo 1). Estado: hecho; verificación independiente aprobada. Commit: este corte.
  - **T2e** — Propiedad y enlaces de recetas y plantillas privadas, sin romper referencias. S1, S11–S13, S17–S19. Ruta: posterior a T2d. Estado: pendiente. Commit: —.
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
- **L11** — T2b `d22c3d0`: RED por ausencia de columna; GREEN en upgrade y base limpia. Anclas clínicas de otro tenant rechazadas, cascadas previas y columnas preservadas; verificador independiente exit 0, typecheck y 2.861 tests aprobados.
- **L12** — T2c deriva ownership del outbox desde sus tres referencias; la expansión conserva las escrituras legacy y no despacha mensajes.
- **L13** — T2c `99e151b`: GREEN e independiente exit 0 en Postgres descartable, incluidos rechazo de cruces, preservación de filas, instalación limpia y rollback ante conflicto; typecheck y 2.861 tests aprobados. T2 sigue abierto: catálogo, conversaciones y vínculos secundarios pendientes.
- **L14** — SARA2 no es solo referencia compartible: la profesional puede cambiar `Food.active` y crear `FoodMeasure` para filas SARA2, sin metadato de origen de la medida. No heredar visibilidad global para esas personalizaciones. Pendiente decidir producto: catálogo oficial compartido con personalizaciones privadas por tenant, o catálogo íntegramente separado por tenant.
- **L15** — Decisión del usuario:

  Vamos con la primera opción: el catálogo oficial SARA2 será global y compartido entre todos los consultorios.

  Definimos estas reglas para la HU-024:

  - Los alimentos oficiales de SARA2 y sus valores nutricionales serán compartidos.
  - Cada consultorio tendrá sus propias preferencias de visibilidad de alimentos.
  - Las medidas caseras personalizadas serán independientes por tenant.
  - Los alimentos creados manualmente por una nutricionista pertenecerán exclusivamente a su consultorio.
  - Las recetas, planes nutricionales y demás datos clínicos deberán permanecer completamente aislados.
  - Una modificación realizada por un consultorio nunca deberá alterar los datos ni las preferencias de otro.
  - Los nuevos consultorios deberán visualizar el catálogo oficial completo por defecto.
  - La migración deberá conservar las personalizaciones existentes, asociándolas únicamente al consultorio original.
  - Evitar duplicar innecesariamente el catálogo oficial en PostgreSQL.

  Implementá el modelo de datos necesario para estas reglas, respetando el diseño actual y evitando romper las referencias de alimentos utilizadas por planes y recetas existentes.

  Incluí pruebas de aislamiento entre al menos dos consultorios y verificá que la actualización del catálogo SARA2 no sobrescriba las personalizaciones privadas.

  Continuá con la HU-024 siguiendo el flujo de GitHub Projects acordado. No ejecutes migraciones en producción ni realices push o merge sin autorización.

- **L16** — T2d staged. La revisión encontró que el freno legacy no contabilizaba bajas oficiales de filas ocultas; RED exit 1 (`Missing expected rejection`), GREEN exit 0 al proteger los dos listados. Probe local y ejecución desde scratch del verificador: exit 0, con dos tenants, importador real, preservación de referencias, upgrade e instalación limpia. Typecheck y 2.861 tests aprobados tras corregir el freno. El verificador emitió resultado parcial: no hizo pruebas propias ni comparación ejecutable contra `99e151b`. No se cerró ni commiteó T2d; T2e/T3/T4 siguen pendientes. El último estado comprobado de Project #5 fue En curso; no se publicó ni se migró producción.
- **L17** — El usuario pidió completar la revisión con contexto independiente, comparar con `99e151b`, ejecutar pruebas propias en PostgreSQL descartable y mantener HU-024 En curso. El revisor nuevo `mwok3050-f-p4la` comparó el diff y obtuvo typecheck exit 0; la suite en scratch excedió 30 s, y omitió PostgreSQL por su límite de escrituras fuera del scratch (estado del daemon Docker). Veredicto: no certificable; ningún defecto reproducido. El probe del candidato y la suite principal previos conservan su evidencia, pero no cubren la ejecución propia del revisor. Sin commit ni avance a T2e. Project #5 releído: En curso.
- **L18** — Con autorización del usuario, el padre provisionó un PostgreSQL 16 descartable en loopback y el revisor independiente `mwokdr6v-g-gxjx` ejecutó sus propias pruebas sin Docker. Exit 0: 32 migraciones de `99e151b`, fixture propio, upgrade candidato, comparación de filas/medidas/referencias completas de plan y receta, backfill, aislamiento de dos tenants, unicidad, paridad del cargador y refresh sin alterar personalizaciones, guard con estado intacto al rechazar. Ningún defecto reproducido. El revisor dejó S6/S18 parciales: no ejecutó instalación limpia ni retiro y reingreso con autorización explícita. Instancia y acceso descartados; no se cerró ni commiteó el corte.
- **L19** — El usuario autorizó las dos pruebas pendientes de forma aislada. `mwokkwzz-h-o5rb` aprobó T2d: instalación limpia (33 migraciones reales, 890 claves e IDs únicos del dataset oficial y carga idempotente), retiro explícito de una clave y restauración con 0 filas creadas. Las referencias completas de plan y receta, el ID, las medidas y las preferencias siguieron intactos; al volver el alimento, se restableció la visibilidad distinta entre consultorios. Todas las ejecuciones exit 0. Instancia descartada. Project #5 releído: En curso.
