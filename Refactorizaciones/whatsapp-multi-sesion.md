# HU-027 · Corte 1: vínculo explícito entre consultorio y conexión

Implementa los dos escenarios de la [HU-027](../docs/hu-whatsapp-multi-sesion.md) sin cambiar el esquema ni habilitar números adicionales en producción.

| Límite | Cambio | Evidencia esperada |
|---|---|---|
| Entrada (`apps/bot/src/whatsapp.ts`, `index.ts`) | Vincular consultorio y transporte al registrar la conexión. El adaptador de arranque puede leer la configuración de la instalación actual; los callbacks de texto y adjuntos reciben el vínculo, sin resolverlo desde el JID. | Dos conexiones simuladas entregan eventos con igual JID bajo ámbitos distintos. |
| Conversación (`conversation.ts`, `booking.ts`, `jid-queue.ts`) | Propagar el consultorio explícitamente a las operaciones de dominio alcanzadas por texto y adjuntos; serializar con la clave `(tenantId, jid)`. Reutilizar el aislamiento de persistencia por consultorio y JID. | El historial no se mezcla; dentro de cada par se conserva el orden. |
| Salida (`workers.ts`, `whatsapp.ts`) | Seleccionar mensajes encolados del consultorio asociado al transporte y despachar solo por ese transporte. No recurrir a un socket global como alternativa ante un vínculo ausente o no disponible. | Cada socket simulado recibe solo los mensajes de su consultorio. Una caída de A no manda sus mensajes por B ni los marca enviados. |

## Verificación

- Escribir primero los tests que atraviesan entrada, conversación y salida con dobles de Baileys y persistencia controlada. Conservar cobertura del recorrido actual de un solo consultorio.
- Correr tests enfocados, `npm run typecheck` y `npm test` desde la raíz. No conectar a WhatsApp ni modificar datos existentes.
- Verificación independiente del límite de aislamiento antes de considerar listo el corte.

No modifica credenciales, QR, semántica de reintentos, esquema de deduplicación, recorrido de crons ni licencias.
