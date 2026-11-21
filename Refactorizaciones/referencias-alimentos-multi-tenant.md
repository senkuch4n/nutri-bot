# HU-024 · Referencias a alimentos (T2e.2b)

## Persistencia (T2e.2b.i)

`PlanMealItem`, `TemplateMealItem` y `RecipeIngredient` pueden referenciar el mismo ID oficial SARA2 desde cualquier consultorio, incluso si está oculto o retirado. Para `PROPIO`, el tenant del plan, plantilla o receta debe coincidir con el del alimento cuando ambos se conocen. Un `NULL` mantiene la ambigüedad legacy: no acredita pertenencia ni otorga autorización.

## Implementación y operación

La migración `20261120121400_food_reference_ownership` exige `READ COMMITTED`, bloquea escrituras en las tablas involucradas y audita antes de instalar los triggers. Un único `DO` hace atómico el cambio. Las FK siguen gobernando la existencia, la actualización de ID y `ON DELETE SET NULL`. No se cambian la inmutabilidad de origen/propietario del catálogo, el importador ni las preferencias. Completar un `PROPIO` sin dueño con `legacy-tenant` sigue siendo posible si no genera un cruce conocido.

Los triggers revisan la referencia o el conjunto de descendientes afectados por el cambio de dueño o de padre. Las escrituras relevantes serializan la validación mediante una fila versionada privada; un escritor con snapshot anterior en `REPEATABLE READ` puede recibir `40001` en vez de validar con datos obsoletos. Es un punto de contención para escrituras de referencias, no para lecturas o cambios de visibilidad. Transacciones concurrentes con órdenes de bloqueo distintos también pueden recibir `40P01`; en ambos casos corresponde reintentar la transacción completa. El alcance no incluye autorización de escritores autenticados (T2e.2b.ii).

## Diagnóstico y recuperación

Ante cruces históricos, el SQL devuelve `23514` (`food_reference_ownership`) con `Historical cross-tenant food references`. El detalle JSON ordenado lista `[recurso, id del recurso, id del ítem o ingrediente, foodId, tenant del recurso, tenant del alimento]` para cada cruce. No se reasigna, borra ni desvincula ningún dato.

Conservar el diagnóstico y corroborar que no quedaron cambios en filas o DDL. Si se usó Prisma, inspeccionar el historial y solo si existe un intento fallido no revertido y se comprobó el rollback, registrar `prisma migrate resolve --rolled-back 20261120121400_food_reference_ownership`. Antes de reintentar, acordar por separado una corrección explícita de las referencias identificadas; la migración no ofrece una reparación automática. Este procedimiento no autoriza intervenciones en bases reales.

## Evidencia del autor

`bash packages/db/scripts/test-food-reference-ownership.sh` ejecutó los SQL ancestros hasta T2e.1a y este corte en PostgreSQL 16 descartable, sin puertos ni temporales de host. Sin el candidato: exit 1 porque se aceptaban los cruces históricos. Con el candidato: exit 0; los tres conflictos históricos dieron psql exit 3 con el detalle exacto y snapshots idénticos de filas y DDL. Tras corregir solo el fixture, se conservaron las referencias previas y pasaron los quince rechazos de escritura, la compatibilidad con propiedad desconocida, los enlaces oficiales ocultos/retirados, las acciones FK y el rechazo concurrente `40001`.

El probe no aplica T2e.2a ni reproduce su recuperación con Prisma; tampoco prueba cambios del importador, que queda intacto. El revisor independiente `mwppeuu6-d-wkxn` repitió el probe (exit 0) y probó una variante con ambos guards instalados. Con un rol limitado, una inserción múltiple con alimento propio, SARA2 retirado y alimento ajeno fue rechazada íntegramente (psql exit 3, detalle del ítem ajeno, dump idéntico); una inserción posterior con propio y oficial retirado pasó (exit 0). No se reprodujo un defecto de este corte. No se ejecutó recuperación operativa de Prisma para alimentos ni se repitió la de recetas. T2e.2a conserva la aprobación independiente pendiente; la aplicación de su SQL como parte de la cadena sana no altera ese estado.

## Escritores directos autenticados (T2e.2b.ii)

El guard del dominio consulta el ID exacto en la base con el consultorio resuelto por el servidor. Admite SARA2 aunque esté oculto o retirado y PROPIO solo cuando pertenece al consultorio. Rechaza alimentos ajenos, sin dueño o inexistentes antes de escribir, incluso al guardar un borrador. Publicar un borrador valida los ingredientes guardados en la misma transacción que cambia su estado y borra las imágenes de importación. El SQL del corte anterior sigue siendo la última barrera de integridad.

El alta directa desde el panel de plantillas sigue admitiendo solo SARA2 activo o texto libre. La aplicación de una plantilla a una paciente sigue rechazando PROPIO histórico, incluso del mismo consultorio, y ahora también rechaza un ID sin alimento asociado. Los escritores legacy sin contexto conservan sus firmas y no usan el guard nuevo.

Vitest con dos consultorios sintéticos y Prisma mockeado: RED exit 1 (ocho rechazos faltantes); GREEN exit 0 (75 pruebas focales). Typecheck de los cuatro workspaces y suite general exit 0 (3.011 aprobadas, una omitida). No se repitió la recuperación de Prisma ni se cambió la aprobación independiente de T2e.2a. El revisor `mwppqh09-f-k69d` repitió las 75 pruebas focales y ejecutó un probe propio de IDs exactos, duplicados y entrada vacía (exit 0 en ambos). No encontró bloqueantes de escritores directos. Son pruebas con mocks, complementarias al probe real de persistencia anterior; no acreditan un recorrido integrado con PostgreSQL ni cierran todas las rutas semanales.

Seguimiento separado: copia de día, repetición y restauración del editor semanal pueden volver a insertar IDs; su validación de pertenencia a nivel de aplicación para PROPIO sin dueño no se agrega en este corte. Los cruces de dueños conocidos siguen cubiertos por SQL. El contexto general de planes y sus escritores sigue en T3.
