# HU-024 · Modelo multi-tenant y migración de la base de datos

**Alcance del MVP validado; lista para desarrollo.** [Issue #67](https://github.com/senkuch4n/nutri-bot/issues/67). Sin dependencias declaradas; es la base de HU-025 a HU-031.

> Como administrador de Arzium, quiero alojar múltiples consultorios independientes en NutriBot, para escalar la plataforma sin mezclar sus datos.

## Alcance

Hoy el panel y el bot dependen de una única fila `Professional(1)` y la disponibilidad no está filtrada por consultorio. Esta HU define la propiedad de los datos, elimina las selecciones globales implícitas y prepara una migración aditiva de la instalación existente. No habilita por sí sola el servicio SaaS para nuevos clientes.

- **`Tenant`** identifica un consultorio independiente. Es el ámbito de aislamiento de datos y el titular de la futura suscripción a Arzium, que no pertenece a un usuario, una profesional ni un paciente.
- **`User`** identifica a quien accede al producto. **La pertenencia** relaciona al usuario con un tenant y determina sus roles o permisos en ese consultorio. **`Professional`** representa a quien atiende, no a quien inicia sesión. Son conceptos distintos, aunque una persona pueda cumplir ambas funciones. HU-025 implementa la autorización en los puntos de acceso.
- **Por tenant, el MVP tiene una profesional principal y una agenda.** La titularidad de la agenda y de los turnos debe ser explícita. El diseño debe permitir agregar profesionales y agendas al mismo consultorio sin mover los datos clínicos ni rediseñar la identidad del tenant, las pertenencias o la facturación. No se habilitan agendas adicionales en esta etapa.
- **Cada tenant admite una conexión de WhatsApp y una cuenta de Mercado Pago para señas.** Se conservan las conexiones y cuentas existentes; un consultorio sin configurar no toma las de otro. Recibir señas con la cuenta del consultorio y pagar la suscripción a Arzium son flujos distintos.
- Inventariar todos los modelos y clasificar su propiedad. Mantener las identidades y relaciones de los datos existentes al vincularlos al consultorio inicial. Documentar el respaldo, la validación de la carga inicial y el procedimiento de reversión antes de considerar producción.

## Mapa inicial de datos

| Grupo | Límite que debe validar la especificación técnica |
|---|---|
| Identidad, pertenencia, profesional, agenda, disponibilidad y turnos | Separar identidad de acceso y perfil profesional. La agenda y sus turnos pertenecen al consultorio; documentar cómo se asociarán futuras agendas con sus profesionales sin cambiar ese límite. |
| Pacientes, historia clínica, consultas, reportes, diario y nutrición | Datos privados del consultorio, incluso cuando la propiedad sea indirecta. El mismo identificador de WhatsApp puede corresponder a pacientes distintos en consultorios distintos. |
| Pagos, credenciales, conversaciones, cola y estado del bot | Identificar la propiedad sin cambiar el flujo de señas ni activar conexiones de otros consultorios. La suscripción a Arzium no usa la cuenta de señas. |
| Alimentos, recetas y plantillas | Mantener privados los alimentos propios, recetas y plantillas aunque sean importados. La especificación técnica debe distinguir la referencia SARA2 de los datos propios y documentar las únicas referencias compartidas permitidas. |

## Criterios de aceptación

| ID | Resultado verificable |
|---|---|
| CA-1 · Identidad y configuración | Con dos consultorios de prueba, cada uno identifica su profesional principal, su única agenda y, cuando estén configuradas, su propia conexión de WhatsApp y cuenta de señas. Los roles o permisos se representan mediante la pertenencia, no mediante el perfil profesional. Un consultorio sin integración configurada no hereda la del otro. |
| CA-2 · Evolución del modelo | El diseño muestra cómo asociar una segunda profesional y una segunda agenda al mismo tenant, sin reasignar pacientes ni turnos existentes, recrear pertenencias o cambiar el titular de la suscripción. El MVP sigue sin exponer ni permitir gestionar agendas adicionales. |
| CA-3 · Aislamiento | Los consultorios A y B pueden tener pacientes distintos con el mismo JID. Al intentar vincular un turno de A con un paciente de B, la operación se rechaza y no cambia el almacenamiento. Los índices, restricciones y validaciones cubren también las relaciones indirectas clasificadas en el mapa de propiedad. |
| CA-4 · Migración segura | Al ensayar la migración aditiva sobre una copia saneada y descartable se crea el consultorio inicial y se conservan IDs, relaciones, datos clínicos, agenda, pagos y configuraciones existentes. Se verifican los conteos y las relaciones antes y después, y se demuestra la restauración en un entorno descartable. Los flujos de seña siguen funcionando sin cambiar ni exponer secretos. |
| CA-5 · Inventario y accesos | La documentación clasifica cada modelo persistente como propio de un tenant, heredado por relación o compartido por diseño. Los flujos de panel, bot y dominio que dependen de un consultorio no seleccionan silenciosamente `Professional(1)`. Si queda un adaptador temporal para compatibilidad, su uso, límites y retiro quedan documentados. |
| CA-6 · Facturación separada | El diseño identifica al `Tenant` como único titular de la futura suscripción a Arzium, independientemente de qué `User` o `Professional` se vincule a él. No se crea una suscripción, no se cobra y no se reutiliza la cuenta de Mercado Pago de señas para ese fin. |

## Fuera de alcance

Múltiples agendas o profesionales operativas dentro de un consultorio; control de acceso completo (HU-025), registro y onboarding (HU-026), operación de múltiples sesiones y workers (HU-027), conexión de integraciones por consultorio (HU-028), cobro y licencia SaaS (HU-029/030) y lanzamiento (HU-031). No se autoriza ninguna migración destructiva ni la aplicación de una migración en producción.

## Especificación técnica

El inventario de modelos, las etapas de compatibilidad y los ensayos aislados figuran en [la SDD](../Refactorizaciones/modelo-multi-tenant.md). El estado operativo se consulta en el Project #5.
