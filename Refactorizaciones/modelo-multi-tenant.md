# SDD HU-024 · Límites de propiedad y migración multi-tenant

- [Issue #67](https://github.com/senkuch4n/nutri-bot/issues/67) · [Alcance y CA](../docs/hu-modelo-multi-tenant.md) · Rama: `feat/HU-024-modelo-multi-tenant`.
- Afecta `packages/db`, `apps/web` y `apps/bot`. `packages/core` permanece puro; solo cambiarlo si hace falta transportar un tipo o una regla independiente de Prisma.
- Este plan no autoriza un despliegue ni una migración contra producción o la base de desarrollo existente.

## 1. Modelo y límite del MVP

| Concepto | Responsabilidad |
|---|---|
| `Tenant` | Identidad del consultorio, frontera de datos y titular de la futura suscripción a Arzium. La suscripción no se crea en esta HU. |
| `User` | Identidad de acceso independiente de la profesional. No se crean credenciales ni se amplía el acceso de quien ya entra al panel. |
| Pertenencia | Relación `User`–`Tenant`, única por par, con rol en ese tenant. HU-024 limita la autorización a recetas y plantillas privadas; la autorización general queda en HU-025. |
| `Professional` | Perfil asistencial del tenant. El perfil principal se selecciona explícitamente dentro del tenant; no se impone unicidad sobre el conjunto de profesionales del consultorio. |
| `Agenda` | Pertenece al tenant y se vincula con una profesional del mismo tenant. Disponibilidad y turnos referencian la agenda correspondiente. El flujo MVP usa solo la agenda principal; no expone CRUD de agendas o profesionales adicionales. |
| Integraciones | Una configuración de WhatsApp y una cuenta de señas por consultorio; la ausencia de configuración no habilita usar la de otro tenant. No se duplican sesiones, se rotan tokens ni se habilita el cobro de suscripción. |

Las relaciones que admitan varias filas en el futuro no deben usar `tenantId` como única clave de fila. Usar una selección explícita de principal con integridad del mismo tenant, no una restricción global que obligue a cambiar IDs para agregar otra agenda. La identidad clínica queda en el consultorio, no en una agenda: sumar otra no mueve a pacientes, turnos existentes, pertenencias ni facturación.

## 2. Inventario de modelos existentes

| Ámbito | Modelos | Aplicación |
|---|---|---|
| Tenant o agenda, directos | `Professional`, `Patient`, `Service`, `AvailabilityRule`, `AvailabilityException`, `Appointment` | El servicio y el paciente son del consultorio; disponibilidad y turno están ligados explícitamente a su agenda. El turno solo vincula un paciente y servicio del mismo consultorio. |
| Clínica, propiedad heredada | `DiaryEntry`, `ClinicalRecord`, `EvolutionEntry`, `AnthropometricReport`, `Consultation`, `NutritionPrescription` | La cadena clínica conserva el dueño; cuando haya más de un padre o referencia opcional, no admitir dueños distintos. |
| Planes privados | `NutritionPlan`, `PlanMeal`, `PlanMealItem`, `PlanSection` | Heredar el dueño a partir del plan y su paciente. Restringir referencias a recetas, plantillas o alimentos privados al mismo consultorio. |
| Catálogo mixto y contenido privado | `Food`, `FoodMeasure`, `PlanTemplate`, `PlanTemplateSection`, `TemplateMeal`, `TemplateMealItem`, `Recipe`, `RecipeIngredient`, `RecipePhoto`, `RecipeImportImage` | Solo la referencia de origen `SARA2` puede ser compartida. `PROPIO`, recetas y plantillas importadas o manuales quedan en su tenant; los hijos heredan el dueño. Las referencias de items a un alimento validan visibilidad de SARA2 o propiedad local. |
| Pago, bot y operaciones | `Payment`, `MercadoPagoAccount`, `MercadoPagoOAuthState`, `OutboundMessage`, `ConversationState`, `BotStatus`, `PatientInquiry`, `BotAiQuestion` | Pagos y mensajes heredan contexto si tienen turno; persistir el ámbito explícito si pueden existir sin turno. Revisar JID, estado OAuth, destinatarios y eventos sin FK como rutas de cruce. No exponer ni cambiar tokens. |

Aplicar claves y FKs compuestas en enlaces entre entidades de un mismo tenant cuando un FK simple permita cruzarlas; validar las referencias mixtas o polimórficas en el mismo límite de escritura cuando no puedan representarse como FK. La unicidad de JID del paciente deja de ser global y pasa a ser por tenant. No degradar unicidades técnicas (por ejemplo, el hash aleatorio de un estado OAuth) si no representan identidad de negocio. Enumerar consumidores de índices únicos antes de cambiar sus selectores Prisma.

## 3. Secuencia de implementación

1. **Fundación aditiva:** definir tenant, identidad, pertenencia y agenda; vincular al consultorio inicial la profesional y la agenda preexistentes sin renumerar la profesional. Mantener compatibilidad con el binario vigente durante la transición. Verificar creación desde cero y actualización de un esquema anterior con registros ficticios.
2. **Propiedad y backfill:** incorporar claves de propiedad por grupo. Para tablas con filas, agregar las columnas compatibles, rellenar desde el dueño conocido, auditar conteos, nulos, duplicados y enlaces cruzados; recién después activar las restricciones. En agenda, mantener temporalmente los enlaces simples y el JID global: los turnos ya asignados también deben cumplir FKs compuestas y un par completo tenant/agenda. Sin agenda inicial, la migración no debe adivinar el dueño de los turnos o de la disponibilidad existentes. No editar migraciones ya aplicadas.
3. **Consumos y escrituras:** hacer explícito el contexto en el dominio compartido y en los consumidores de panel y bot; revisar tanto lectores como escritores, los dos tipos de procesos y seeds. El adaptador de la instalación existente solo puede resolver el tenant inicial configurado explícitamente. No habilitar la operación SaaS de un segundo tenant antes de los controles de HU-025 y las integraciones siguientes.
4. **Cierre de compatibilidad:** comprobar que no queden escrituras sin dueño antes de endurecer restricciones o retirar el adaptador. El deploy vigente migra antes de levantar los binarios nuevos: no colocar en una misma entrega un requisito que el binario anterior no pueda cumplir. Mantener separados expansión y endurecimiento, con comprobación de que todos los escritores cambiaron entre ambos.

**Corte T2a — integraciones:** `MercadoPagoAccount` y `BotStatus` admiten como máximo una fila con dueño por tenant. `MercadoPagoOAuthState` indexa el dueño, pero conserva la unicidad global de `stateHash`. La migración asigna las filas existentes a `legacy-tenant` en una sola transacción. En instalaciones nuevas no crea filas de integración. Si hay más de una fila histórica de cuenta o estado del bot, la unicidad hace fallar el backfill completo en lugar de elegir una fila. Durante la expansión las tres claves de propiedad siguen siendo opcionales: los binarios anteriores mantienen `id = 1` y pueden escribir sin `tenantId`. Este corte no cambia los selectores, las sesiones de WhatsApp ni el cobro de suscripción.

**Corte T2b — raíces clínicas:** `Consultation`, `EvolutionEntry` y `NutritionPlan` copian el dueño de su `Patient`; `AnthropometricReport` copia el de su `EvolutionEntry` después de ese backfill. Si el padre no tiene dueño, la fila queda sin dueño. Las FKs compuestas obligan a que las filas con dueño coincidan con su padre; se conservan las FKs simples, sus cascadas y las escrituras legacy sin `tenantId`. `ClinicalRecord`, `DiaryEntry` y `NutritionPrescription` siguen acotados por la cadena de su padre directo.

Este corte no verifica el tenant en los enlaces secundarios `Consultation` → `Appointment` / `NutritionPlan` ni `EvolutionEntry` → `Consultation`: sus restricciones previas no cambian. Cuando los escritores ya propaguen el contexto, hacer un backfill de alcance conocido para las filas que quedaron sin dueño, auditar nulos y cruces en esos enlaces y corregirlos antes de agregar restricciones de mismo tenant. Hasta entonces, estas FKs no constituyen aislamiento clínico completo.

**Corte T2c — outbox:** `OutboundMessage` admite un dueño explícito y opcional. El backfill toma el tenant de las referencias a turno, plan e informe cuando todas las referencias presentes tienen el mismo dueño. Si dos dueños conocidos difieren, aborta toda la migración, incluso si otra referencia no tiene dueño. Si falta el dueño de alguna referencia y no hay conflicto, deja el mensaje sin dueño para el backfill posterior. Solo los mensajes históricos sin referencias se asignan a `legacy-tenant`, creado por T1; no se infiere nada del destinatario ni del contenido. Las FKs compuestas verifican los enlaces de mensajes con dueño; en PostgreSQL el `SET NULL` de cada una se limita al ID de la referencia borrada y no limpia `tenantId`. Conservar esas listas de columnas si se recrean las FKs: Prisma no las expresa en su esquema. Se mantienen las escrituras legacy y la deduplicación; no se activa el despacho multi-tenant ni se cambia `ConversationState`.

**Corte T2d — catálogo:** cada SARA2 conserva su ID y `sourceKey` global; cada `PROPIO` existente y cada medida existente quedan en `legacy-tenant`. El catálogo oficial parte disponible: `active` mezclaba ocultos y retirados y no permite distinguirlos. Se conserva ese campo y se copia cada oculto a una preferencia `false` solo para el consultorio original. El cargador concilia `catalogActive` con el dataset sin tocar preferencias, medidas ni propios, y conserva el freno, los contadores y el comportamiento legacy de `active`.

`tenant_visible_foods(tenantId)` devuelve IDs visibles: oficial disponible sin preferencia `false`, o propio activo del mismo tenant. No autentica al llamador. Las medidas admiten el mismo nombre normalizado por alimento en distintos tenants; sus referencias a propios deben coincidir con el dueño. Las preferencias solo referencian oficiales. El origen y el dueño no se cambian, salvo para explicitar el dueño legacy de un propio sin asignar. Hasta T3, los escritores de medidas sin contexto usan el default `legacy-tenant`, incluso para propios creados sin dueño; estos propios todavía no entran en la consulta acotada. Los lectores actuales siguen siendo exclusivamente de la instalación legacy. Este corte no reescribe las referencias de recetas, plantillas ni planes.

**Corte T2e (1) — raíces privadas:** `Recipe` y `PlanTemplate` incorporan un `tenantId` opcional con FK a `Tenant`. El backfill asigna todas las raíces existentes a `legacy-tenant` sin cambiar IDs ni columnas anteriores. Los hijos heredan el dueño por sus FKs existentes; no se cambian las cascadas ni las referencias de comidas. Las escrituras sin contexto siguen admitiendo `NULL` y `importKey` sigue siendo único globalmente en cada modelo, preservando los selectores de importación actuales. El cambio a unicidad por tenant debe coordinarse con los escritores y selectores de T3 y el backfill final de filas legacy sin dueño; no se retira antes el índice global.

El corte T2e (2) queda pendiente: validar cruces de tenant en los enlaces a recetas y alimentos, sin romper referencias históricas a SARA2 oculto o retirado y contemplando las raíces legacy con `NULL`. La propiedad de las raíces no aísla por sí sola los enlaces, las lecturas ni las escrituras.

### Membresías del consultorio original (T2e.1a)

En un despliegue autorizado, respetar este orden: **esquema → datos revisados → web**. Respaldar y verificar el destino; aplicar primero la migración aditiva (`User.googleSubject` nullable y único), que no crea membresías. Antes de desplegar la web de T2e.1b, revisar y aplicar un padrón privado que incluya explícitamente a **todas** las personas que ya tienen acceso legítimo al consultorio original y a al menos un `OWNER`. Verificar cada `googleSubject` contra el `sub` de una identidad de Google comprobada para esa persona; no deducirlo del email ni copiar `ALLOWED_EMAILS` como padrón.

Formato JSON (ejemplo sintético):

```json
[{"googleSubject":"1001","email":"owner@example.test","role":"OWNER"}]
```

Roles permitidos: `OWNER` y `STAFF`. Usar el email principal canónico (minúsculas, sin espacios) y el `sub` exacto como cadena. No listar alias: el comando no infiere equivalencias entre direcciones diferentes. Conserva el email almacenado cuando coincide tras normalizar mayúsculas y espacios. Si el email o el `sub` entran en conflicto con otro usuario, o el rol existente difiere, se rechaza todo el padrón sin reasignar identidades ni actualizar roles.

Con `DATABASE_URL` provista por el operador para el destino autorizado, desde la raíz:

```bash
npm --silent run legacy-memberships --workspace packages/db -- /ruta/privada/padron.json
npm --silent run legacy-memberships --workspace packages/db -- /ruta/privada/padron.json --apply
```

El primer comando solo muestra conteos; revisar el resultado antes de ejecutar el segundo, que aplica todos los cambios en una transacción. Repetir con el mismo padrón no cambia filas coincidentes; omitir una fila no revoca una membresía. El único destino es `legacy-tenant`. Mantener el padrón fuera del repositorio y no publicar sus identificadores. Ni `ALLOWED_EMAILS` ni el email de perfil otorgan pertenencia. T2e.1b implementa la autorización en runtime; altas e invitaciones, administración de roles y cambio de consultorio quedan en HU-025.

### Contexto para recetas y plantillas privadas (T2e.1b.i)

Al iniciar sesión, Auth.js vincula el ID interno solo si el `sub` del perfil verificado de Google coincide exactamente con el identificador de la cuenta OAuth y ya existe en `User.googleSubject`. El JWT y la sesión llevan ese ID opaco, no el rol ni el consultorio. Un JWT anterior al cambio no tiene ese vínculo: después de aplicar el padrón, cerrar sesión y volver a entrar con Google. La lista `ALLOWED_EMAILS` conserva su función de acceso al panel y no otorga membresía.

`resolvePrivateContentAccess()` consulta la sesión y la pertenencia actual del lado servidor para cada operación. `OWNER` y `STAFF` pueden leer, crear, modificar y eliminar recetas y plantillas privadas del consultorio. Sin usuario vinculado, sin pertenencia o con más de una pertenencia, no hay contexto autorizado. La selección de consultorio queda en HU-025.

### Autorización en el panel (T2e.1b.ii)

El panel usa ese contexto para consultar y modificar recetas y plantillas, incluidas las colas de revisión, los medios, el selector de recetas, los editores de plantillas y la aplicación de una plantilla a un paciente. Las escrituras verifican el dueño en la base; las que operan sobre hijos también verifican el padre. La aplicación exige que la plantilla y el paciente pertenezcan al consultorio autorizado. Los medios del panel no se almacenan en caché; un ID ajeno no se distingue de uno inexistente.

El portal sigue autorizando por sesión de paciente y plan habilitado, no por pertenencia de profesional. Este corte no corrige enlaces históricos cruzados, no migra el CRUD clínico general ni cambia los importadores CLI. Los límites de referencias quedan en T2e.2 y la administración de usuarios y roles en HU-025. La certificación de aislamiento requiere repetir las pruebas defensivas y comprobar con dos consultorios en PostgreSQL descartable.

## 4. Pruebas y seguridad de la migración

- Usar Postgres 16 en un contenedor nuevo y descartable, con puerto dinámico en `127.0.0.1`, credencial de prueba y `DATABASE_URL` explícita. No cargar el `.env` del repo; no usar la DB habitual, `migrate reset` ni `db push`. Si se requiere shadow, crear una DB descartable distinta y comprobar los destinos antes de ejecutar.
- RED antes del cambio: reproducir la violación de cada nuevo invariante con una prueba de la superficie pública o de PostgreSQL para restricciones. GREEN: comparar la migración desde cero y desde el historial anterior con fixtures sintéticos; probar JID repetido entre tenants, rechazo de referencias cruzadas sin cambios y continuidad de los IDs y relaciones.
- Desde la raíz del worktree: `bash packages/db/scripts/test-tenant-foundation.sh` para la fundación y `bash packages/db/scripts/test-scheduling-ownership.sh` para el upgrade de agenda. `bash packages/db/scripts/test-integration-ownership.sh` comprueba el upgrade de integraciones con datos sintéticos, la instalación limpia, las restricciones y la compatibilidad con escritores legacy. Requieren dependencias del worktree e imagen local `postgres:16-alpine`; no reutilizan contenedores ni cargan un `.env`.
- `bash packages/db/scripts/test-clinical-ownership.sh` comprueba la expansión clínica en Postgres descartable: upgrade con dos tenants y una cadena sin dueño, preservación de columnas anteriores, rechazo de anclas cruzadas, cascadas, instalación limpia y escrituras legacy.
- `bash packages/db/scripts/test-outbound-ownership.sh` prueba el upgrade y la instalación limpia en Postgres descartable, la preservación de los mensajes y sus deduplicaciones, el rechazo de referencias cruzadas y el rollback si hay dueños históricos incompatibles. También verifica que borrar las referencias no borra el dueño y que los escritores legacy siguen funcionando.
- `bash packages/db/scripts/test-catalog-ownership.sh` prueba la expansión del catálogo sobre un upgrade sintético y una instalación limpia. Ejercita dos tenants y el cargador real con un dataset mínimo en Postgres 16 descartable.
- `bash packages/db/scripts/test-private-content-ownership.sh` prueba la expansión de raíces privadas en un upgrade sintético y una instalación limpia: backfill, conservación de columnas y enlaces, FKs, borrados y compatibilidad de los importadores legacy a nivel SQL.
- `bash packages/db/scripts/test-legacy-memberships.sh` verifica el upgrade y el comando con identidades sintéticas y dos tenants en Postgres descartable.
- Ensayar la restauración de un `pg_dump` sobre una segunda base descartable y verificar los conteos y referencias, sin pretender que eso sustituye el ensayo posterior con una copia saneada de la instalación real. Si no hay copia saneada autorizada, ese criterio queda sin certificar.
- Regenerar Prisma; correr `typecheck` en web, bot y db y los tests pertinentes de todo el monorepo. No enviar WhatsApp, usar cobros reales ni conectarse a servicios productivos. Conservar el backup verificado, el plan de reversión y las verificaciones de integridad como requisitos para cualquier entrega futura a producción.
