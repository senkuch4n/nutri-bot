# SDD HU-024 · Límites de propiedad y migración multi-tenant

- [Issue #67](https://github.com/senkuch4n/nutri-bot/issues/67) · [Alcance y CA](../docs/hu-modelo-multi-tenant.md) · Rama: `feat/HU-024-modelo-multi-tenant`.
- Afecta `packages/db`, `apps/web` y `apps/bot`. `packages/core` permanece puro; solo cambiarlo si hace falta transportar un tipo o una regla independiente de Prisma.
- Este plan no autoriza un despliegue ni una migración contra producción o la base de desarrollo existente.

## 1. Modelo y límite del MVP

| Concepto | Responsabilidad |
|---|---|
| `Tenant` | Identidad del consultorio, frontera de datos y titular de la futura suscripción a Arzium. La suscripción no se crea en esta HU. |
| `User` | Identidad de acceso independiente de la profesional. No se crean credenciales ni se amplía el acceso de quien ya entra al panel. |
| Pertenencia | Relación `User`–`Tenant`, única por par, con rol en ese tenant. La autorización efectiva se completa en HU-025. |
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
2. **Propiedad y backfill:** incorporar claves de propiedad por grupo. Para tablas con filas, agregar las columnas compatibles, rellenar desde el dueño conocido, auditar conteos, nulos, duplicados y enlaces cruzados; recién después activar las restricciones. No vincular registros ambiguos automáticamente ni introducir un fallback a otro tenant. No editar migraciones ya aplicadas.
3. **Consumos y escrituras:** hacer explícito el contexto en el dominio compartido y en los consumidores de panel y bot; revisar tanto lectores como escritores, los dos tipos de procesos y seeds. El adaptador de la instalación existente solo puede resolver el tenant inicial configurado explícitamente. No habilitar la operación SaaS de un segundo tenant antes de los controles de HU-025 y las integraciones siguientes.
4. **Cierre de compatibilidad:** comprobar que no queden escrituras sin dueño antes de endurecer restricciones o retirar el adaptador. El deploy vigente migra antes de levantar los binarios nuevos: no colocar en una misma entrega un requisito que el binario anterior no pueda cumplir. Mantener separados expansión y endurecimiento, con comprobación de que todos los escritores cambiaron entre ambos.

## 4. Pruebas y seguridad de la migración

- Usar Postgres 16 en un contenedor nuevo y descartable, con puerto dinámico en `127.0.0.1`, credencial de prueba y `DATABASE_URL` explícita. No cargar el `.env` del repo; no usar la DB habitual, `migrate reset` ni `db push`. Si se requiere shadow, crear una DB descartable distinta y comprobar los destinos antes de ejecutar.
- RED antes del cambio: reproducir la violación de cada nuevo invariante con una prueba de la superficie pública o de PostgreSQL para restricciones. GREEN: comparar la migración desde cero y desde el historial anterior con fixtures sintéticos; probar JID repetido entre tenants, rechazo de referencias cruzadas sin cambios y continuidad de los IDs y relaciones.
- Para verificar el primer corte desde la raíz del worktree: `bash packages/db/scripts/test-tenant-foundation.sh`. Requiere dependencias del worktree e imagen local `postgres:16-alpine`; no reutiliza contenedores ni carga un `.env`.
- Ensayar la restauración de un `pg_dump` sobre una segunda base descartable y verificar los conteos y referencias, sin pretender que eso sustituye el ensayo posterior con una copia saneada de la instalación real. Si no hay copia saneada autorizada, ese criterio queda sin certificar.
- Regenerar Prisma; correr `typecheck` en web, bot y db y los tests pertinentes de todo el monorepo. No enviar WhatsApp, usar cobros reales ni conectarse a servicios productivos. Conservar el backup verificado, el plan de reversión y las verificaciones de integridad como requisitos para cualquier entrega futura a producción.
