# HU-024: ensayo de migración y restauración (CA-4)

**Escenario aprobado para CA-4: instalación desde cero.** El usuario confirmó que el SaaS puede partir de una base nueva y que no hay datos del piloto que deban conservarse. No se migra ni se borra la base actual. El ensayo sintético de actualización y restauración ya pasó y queda como evidencia complementaria (ODD L99).

## Validar la instalación nueva

1. Levantar PostgreSQL 16 descartable, vacío, aislado y con credenciales de prueba; fijar la URL del destino explícitamente. No cargar el `.env` del repo ni usar conexiones de integración.
2. Desde una copia aislada del esquema y las migraciones candidatas, ejecutar `prisma migrate deploy` con el CLI local, luego `prisma migrate status`. Verificar que `_prisma_migrations` contenga exactamente las migraciones del candidato, todas completadas y sin intentos fallidos.
3. Inicializar la agenda con el mismo `seedScheduling` de la aplicación, llamado con un perfil ficticio y sin WhatsApp. Verificar el enlace entre consultorio, profesional y agenda primaria. No se requiere onboarding ni se habilitan servicios reales.
4. Registrar códigos de salida y evidencia y eliminar solo los recursos descartables creados para la prueba. El resultado no autoriza entregar ni cambiar la base actual.

**Resultado:** el ensayo local pasó con 39 migraciones registradas como completadas, sin pendientes ni fallidas. `seedScheduling` ejecutado dos veces conservó un consultorio, un profesional y una agenda primaria, con tres servicios y diez reglas de disponibilidad. Contenedor y scratch retirados (ODD L100).

## Procedimiento de referencia si en el futuro hay que conservar historial

Los siguientes pasos son para un despliegue distinto, que necesite importar datos existentes. No son un requisito para el lanzamiento desde cero aprobado ni una autorización para acceder al origen.

### Antes de empezar

- [ ] Acordar la ubicación exacta y el acceso a una copia **ya saneada** y descartable. No extraer datos del origen como parte de este paso. Sin datos personales, texto clínico real, destinos de WhatsApp reales, credenciales reutilizables ni tokens vigentes. La sanitización debe mantener relaciones, IDs internos o sus sustitutos coherentes, y casos representativos de clínica, agenda, señas y configuraciones. Si falta cobertura, registrarla; no inferir preservación de datos ausentes.
- [ ] Fijar el candidato exacto, su versión de Prisma y el hash de los archivos de migración. Registrar la versión de PostgreSQL y la huella de la copia. No usar un candidato cuyo SQL cambie durante el ensayo.
- [ ] Crear dos destinos nuevos y aislados de PostgreSQL 16: **ensayo** y **restauración**. Usar credenciales exclusivas de prueba y bloquear salida hacia proveedores. No cargar el `.env` del repo. Antes de cada operación, confirmar instancia, puerto y nombre de base; abortar si no corresponden al entorno descartable. Nunca usar el despliegue habitual, `migrate reset`, `db push` ni `pg_restore --clean`.

## Secuencia del ensayo

| Paso | Acción | Resultado exigido |
|---|---|---|
| 1. Obtener la línea de base | Restaurar la copia saneada en **ensayo**, vacío y sin procesos del producto. Revisar `prisma migrate status` con la URL explícita del destino y contrastar `_prisma_migrations` con los archivos del candidato. Que haya migraciones pendientes es esperado; historial divergente, checksums incompatibles o intentos previos fallidos bloquean el ensayo. | Historial identificable y sin divergencias. Inventario y comparación inicial registrados. |
| 2. Preparar la recuperación | Sin escritores, generar un respaldo previo al corte con `pg_dump --format=custom` de **ensayo**. Registrar su huella y comprobar el listado con `pg_restore --list`. | Respaldo anterior a toda migración del candidato. Un listado legible no cuenta como restauración. |
| 3. Aplicar y comparar | Usar `prisma migrate deploy --schema packages/db/prisma/schema.prisma` desde la raíz del worktree, con el binario local del proyecto y `DATABASE_URL` explícita del **ensayo**. No lanzar seeds ni importadores. Comparar las mismas proyecciones que en el paso 1 antes de ejecutar pruebas que escriban. | `deploy` exit 0, todas las migraciones previstas completadas, sin intentos fallidos nuevos; consultorio y agenda originales correctamente enlazados. Ninguna pérdida o alteración no prevista. |
| 4. Probar continuidad | Usar solo componentes compatibles y simulados. Ejercitar agenda y una seña representativa con proveedor simulado, sin enviar notificaciones ni contactar servicios reales. Registrar qué trayectos se probaron y cuáles faltan. Ejecutar las comprobaciones mutantes después de la comparación y solo con fixtures propios. | Flujo original y relaciones de pago preservados. Ninguna credencial ni efecto externo. |
| 5. Demostrar recuperación | Restaurar el respaldo del paso 2 en **restauración**, segunda base vacía, con `pg_restore --exit-on-error`. Repetir inventario, comparación e historial contra la línea de base, no contra el estado migrado. | `pg_restore` exit 0, historial previo restaurado y mismas filas, IDs, relaciones y valores de la línea de base. |

## Qué comparar

Medir por tabla preexistente: conteo, conjunto de IDs y coincidencia exacta de los valores y relaciones anteriores por ID. Para tablas sin ID previo, usar su clave anterior (por ejemplo, `ConversationState.patientJid` dentro de esta copia pre-corte). Comparar de forma determinista en el entorno aislado y conservar solo conteos y resultados; no adjuntar filas ni secretos. Los conteos solos no detectan reasignaciones.

| Área | Verificación mínima |
|---|---|
| Instalación original | Un tenant original y su agenda primaria apuntan al profesional existente, sin renumerarlo ni asignar propiedad no demostrable. Distinguir las filas nuevas y columnas agregadas de las anteriores. |
| Clínica y agenda | Paciente, consulta, evolución, plan e informe mantienen IDs y referencias anteriores; turnos, servicios, fechas y estados se preservan. Revisar relaciones directas e indirectas del mapa de propiedad. |
| Señas e integraciones | Pagos conservan turno, monto, estado y referencia saneada. Las configuraciones y los valores cifrados sustitutos no cambian; comparar sin imprimirlos ni descifrarlos. No renovar tokens. |
| Contenido y catálogo | Referencias a recetas, plantillas, alimentos y medidas se conservan; SARA2 oficial sigue compartido y el contenido propio conserva su pertenencia. |
| Bot y cola | Preservar estados, timestamps, contexto saneado y enlaces de mensajes. El nuevo UUID y los backfills de dueño documentados son diferencias esperadas; el JID y los campos históricos no se modifican por la contracción. Estados sin dueño quedan almacenados e inactivos. |

Anotar y justificar las diferencias **antes** de aceptar el resultado: cambios aditivos previstos y backfills demostrables sí; filas faltantes, IDs sustituidos, enlaces reasignados, valores anteriores cambiados sin documentación o credenciales expuestas, no.

## Si falla y cuándo cerrar

- Ante un cruce histórico, abortar y registrar la migración y el diagnóstico saneado. No corregirlo reasignando, borrando ni desligando registros. Preservar historial y evidencia del intento; no ejecutar `migrate resolve` a ciegas ni tratar un registro fallido como éxito.
- Si falla el rollback o la validación, conservar el respaldo y el destino de prueba para diagnóstico. No reimponer las claves globales sobre el esquema contraído, ni arrancar binarios anteriores. La reversión demostrada aquí es restaurar en otra base el respaldo anterior; una reversión real con escrituras posteriores requeriría reconciliación y autorización aparte.
- **Aceptar una migración futura con preservación solo con evidencia de los pasos 1–5:** candidato y versiones, huella del respaldo, resultados y códigos de salida, diferencias esperadas, controles de integridad y restauración. Si falta la copia saneada o algún paso falla, el estado sigue pendiente. El ensayo no aprueba por sí mismo un despliegue ni cierra otras revisiones abiertas de la HU.

Ver [criterios de la HU](hu-modelo-multi-tenant.md) y [diseño de migración y corte](../Refactorizaciones/modelo-multi-tenant.md).
