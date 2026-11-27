# HU-027 · WhatsApp aislado por consultorio

[Issue #70](https://github.com/senkuch4n/nutri-bot/issues/70) · Dependencias: HU-024 y HU-025 · Coordinación: HU-030.

Como administradora de un consultorio, quiero que mi número de WhatsApp funcione de forma independiente de otros clientes de NutriBot.

## Corte 1 · Aislamiento de entrada y salida

La conexión de WhatsApp que recibe el mensaje determina su consultorio. El JID identifica al contacto dentro de ese consultorio; no identifica el consultorio. Este corte conserva un solo número configurado en producción y usa dos conexiones simuladas para verificar el aislamiento antes de habilitar dos números reales.

```gherkin
Escenario: El mismo contacto escribe a dos consultorios
  Dadas dos conexiones simuladas, una por consultorio
  Cuando el mismo JID envía texto y adjuntos a ambas
  Entonces cada consultorio conserva su propia conversación
  Y las respuestas salen únicamente por la conexión que corresponde a cada consultorio

Escenario: Un envío encolado pertenece a un consultorio sin conexión disponible
  Dado un mensaje encolado del consultorio A
  Y que solo está disponible la conexión del consultorio B
  Cuando el bot procesa la cola
  Entonces el mensaje no sale por la conexión de B
  Y no se registra como enviado
```

## Pendiente para completar la HU

- Operar dos o más números simultáneos con QR, credenciales separadas y reconexión independiente.
- Aislar los crons, la ejecución de workers y la deduplicación por consultorio, con idempotencia.
- Verificar el gate de suspensión coordinado con HU-030 (#73), incluido el despacho de mensajes ya encolados.
- Medir capacidad y reconexiones concurrentes en el VPS compartido.

No se enviarán mensajes reales durante las pruebas. Ver [spec técnica del corte 1](../Refactorizaciones/whatsapp-multi-sesion.md).
