# HU-026 · Alta reanudable con acceso según el estado del cobro

[Contrato final de HU-029 #72](https://github.com/senkuch4n/nutri-bot/issues/72#issuecomment-7179046990). La identidad verificada permite iniciar el alta y la membresía identifica a la titular. El consultorio nuevo puede operar si el cobro está apagado o si la suscripción fue verificada; la membresía por sí sola no decide.

## Flujo

1. La profesional inicia sesión con Google. El servidor resuelve la identidad con el flujo existente; no acepta la identidad ni el consultorio desde el formulario.
2. Si corresponde un alta nueva, la profesional completa el nombre del consultorio y la zona horaria. El servidor crea el consultorio y la membresía `OWNER` en la misma transacción. Los reintentos, incluidos los simultáneos, recuperan el mismo alta; si la transacción falla, no queda un alta a medias.
3. Si el servicio no requiere suscripción o esta ya se verificó, la titular entra al panel con los permisos de su membresía. Si está pendiente, vuelve al mismo onboarding: puede ver su estado y los requisitos pendientes, completar el alta o acceder a ayuda. Ver una integración pendiente no implica poder conectarla desde esta HU.

## Persistencia del alta

T2 guarda el nombre del consultorio en `Tenant.name` y su zona horaria en `Tenant.timeZone`. El alta exige ambos valores; la migración `20261126013713_tenant_onboarding_profile` agrega columnas anulables para no rellenar ni alterar los datos previos de `Professional`. `Tenant.name` es el nombre del consultorio, no el de la profesional.

`createOrResumeTenantOnboarding` toma el ID resuelto en servidor. Dentro de una transacción, bloquea la fila de esa identidad verificada antes de leer las membresías o crear datos. Así serializa dos solicitudes de la misma identidad incluso si todavía no existe ninguna membresía. Si no puede crear la membresía `OWNER`, no deja un consultorio huérfano. Una membresía existente fuera de este flujo nunca se transforma ni genera otra alta.

## Perfil profesional y agenda inicial

Para operar, el panel exige un `Professional` y una agenda principal del mismo consultorio. El formulario pide el nombre profesional por separado; `provisionOnboardedClinic({ userId, professionalName, expectedTenantId })` lee el email verificado del `User` y la zona horaria del consultorio. Debe coincidir con el consultorio que el servidor acaba de resolver en el paso de alta; si la membresía cambió entre pasos, rechaza antes de escribir. Solo una identidad vinculada con una única membresía `OWNER` y un alta existente puede aprovisionarlo.

La operación serializa el alta por consultorio, devuelve la agenda principal ya creada en reintentos y crea el perfil y la agenda juntos en una transacción. Al asignar un ID nuevo, bloquea escrituras a `Professional` solo durante la primera creación y toma el siguiente ID libre sobre el máximo; así también coordina con escritores que indiquen un ID explícito. No cambia el default legacy `1` ni requiere otra migración. Si falla la agenda, no queda un perfil huérfano. No habilitar el panel hasta que ambos recursos existan y el estado de suscripción lo permita. La función todavía no está conectada a una acción real.

`apps/web/src/components/onboarding-signup-form.tsx` tiene los tres campos del alta y recibe una acción de servidor como dependencia. El formulario no transporta identidad, email ni ID de consultorio. `apps/web/src/lib/onboarding-signup-action.ts` prepara la acción: resuelve la sesión, valida los tres campos, obtiene o retoma el consultorio y aprovisiona ese mismo consultorio. Solo notifica el éxito después de completar ambos pasos; si falla el perfil o la agenda, el siguiente envío vuelve a resolver el mismo alta sin confirmar antes de tiempo. `apps/web/src/lib/onboarding-server.ts` compone la acción y el adaptador con Auth.js y las operaciones reales de dominio. El proveedor de suscripción y el callback de finalización se inyectan explícitamente; no existe un valor de autorización por defecto. El módulo comprueba que haya agenda principal antes de consultar la suscripción para consultorios nuevos: una titular con alta incompleta retoma la configuración y no obtiene permiso operativo. La composición se probó con dobles, aún no tiene rutas consumidoras y no modifica las guardas activas. El contrato de presentación de errores queda para el recorrido web.

## Reglas de acceso

| Situación | Qué puede hacer |
|---|---|
| Identidad verificada que inicia el alta | Completar los datos del nuevo consultorio. El login por sí solo no crea el consultorio ni concede acceso operativo. |
| Titular de consultorio nuevo, `not_required` | El cobro está apagado. Accede al panel según su membresía, sin suscripción y sin iniciar una prueba desde HU-026. |
| Titular de consultorio nuevo, `verified` | La suscripción fue verificada. Accede al panel según su membresía. |
| Titular de consultorio nuevo, `pending` o error de consulta | Retoma su propio onboarding, consulta su estado y accede a ayuda. Se rechazan páginas, acciones de servidor y API operativas aunque se invoquen directamente. |
| Consultorio ya operativo | Mantener su acceso actual; no se lo manda al onboarding ni se le exige un nuevo alta. |

## Límite con HU-029

- **HU-026 consume** `getTenantSubscriptionGate(tenantId: string): Promise<"not_required" | "verified" | "pending">` desde `packages/db/domain`. El servidor resuelve el ID a partir de la identidad y membresía. Ante error aplica `pending`. No usa `hasVerifiedSubscriptionAuthorization` para decidir el acceso: esa función solo devuelve `true` con `verified`, por lo que no distingue `not_required` de `pending`.
- **HU-029 produce** `not_required` cuando el cobro está apagado, `verified` cuando está activo y se verificó la autorización contra Mercado Pago, y `pending` cuando falta la autorización o se canceló. HU-026 no reimplementa esas comprobaciones, no inicia la prueba gratuita y no reemplaza el control de vigencia de licencia.
- **Navegación:** la titular va a `/ajustes/suscripcion` para suscribirse. Volver a `/ajustes/suscripcion?mp=volver` solo cambia la pantalla; no autoriza la operación.
- **Integración y lanzamiento:** HU-029b implementará la función después del ensayo de Mercado Pago en sandbox; mientras tanto se puede trabajar contra la firma con un mock. En producción el cobro arranca apagado hasta HU-031, por lo que `not_required` habilita a los consultorios nuevos. Eso define el comportamiento del producto, no autoriza publicarlo ni abrir el alta en este corte.

## Corte de política de acceso (T3)

`apps/web/src/lib/onboarding-subscription-access.ts` implementa la decisión de tres estados con un proveedor inyectado. El futuro adaptador debe pasar el ID resuelto desde la membresía y el proveedor real de HU-029b. El evaluador no resuelve identidad, no autoriza la membresía y no se usa todavía en rutas. El panel y sus acciones/API mantienen el comportamiento anterior; no se amplió la lista de consultorios habilitados.

Prueba enfocada: `npm test -- apps/web/src/lib/onboarding-subscription-access.test.ts`. Cubre los tres valores del contrato y la excepción del proveedor; no prueba todavía la aplicación de la decisión en páginas, acciones o API.

`apps/web/src/components/onboarding-pending-screen.tsx` presenta el consultorio y los pasos guardado/pendiente, con enlaces a `/ajustes/suscripcion` y al contacto público de Arzium. El servidor deberá renderizarla solo después de resolver la titular y su consultorio pendiente. No se publica una ruta nueva y se mantiene sin conectar hasta que pueda probarse el flujo de punta a punta, incluida la página de suscripción de HU-029. `npm test -- apps/web/src/components/onboarding-pending-screen.test.ts` verifica el HTML sin base ni red.

El adaptador de servidor `apps/web/src/lib/onboarding-access-adapter.ts` compone sesión, hechos de membresía, perfil de alta y estado de suscripción con dependencias inyectadas. Solo consume `userId` de sesión y obtiene el consultorio de la membresía. Los consultorios ya habilitados conservan su ruta sin consultar suscripción. Para uno nuevo, `resolve()` distingue el onboarding pendiente de la operación; `getOperationalGrant()` devuelve `null` cuando no se puede operar. Un permiso operativo todavía debe convertirse en el contexto del panel con sus comprobaciones habituales de agenda, profesional y alcance.

`npm test -- apps/web/src/lib/onboarding-access-adapter.test.ts` prueba esos resultados con un proveedor simulado y consumidores de prueba que representan una acción y una API. **No** demuestra que páginas o endpoints reales apliquen la decisión: el adaptador aún no está conectado y la lista de consultorios habilitados sigue intacta.

## Verificación y eventual traspaso

**T2 / S2.** En el worktree `.git/local-worktrees/hu-026`, ejecutar `npm run db:generate`, `npm test -- packages/db/domain/tenantOnboarding.test.ts` y `bash packages/db/scripts/test-tenant-onboarding.sh`. El script requiere Docker y la imagen local `postgres:16-alpine`. No descarga imágenes ni lee el `.env` del repo: levanta una base descartable de loopback, aplica una copia de las migraciones, ejecuta los tres casos de Alta y los cuatro de Perfil/Agenda, y limpia sus recursos al salir.

El módulo `packages/db/domain/tenantOnboarding.ts` expone `createOrResumeTenantOnboarding({ userId, name, timeZone })` y devuelve `{ tenantId, role: "OWNER", name, timeZone }`; T2 no lo conecta a rutas. En el caso de rollback se exige el fallo de membresía inyectado y un reintento válido sin huérfanos. El [Log](../odd/tasks/hu-026-onboarding.md#log) conserva los resultados para un eventual traspaso a Neon. Los casos de acceso se ejecutan al implementar T3.

| Corte | Escenario | Resultado observable esperado |
|---|---|---|
| Alta | Dos identidades verificadas dan de alta consultorios. | Cada identidad retoma únicamente su propio consultorio como titular. |
| Alta | La misma identidad reenvía el formulario, también en paralelo, y vuelve a iniciar sesión. | Recupera el mismo consultorio; no duplica ni el alta ni la membresía. |
| Alta | Falla la creación de la membresía después de iniciar el alta; la titular vuelve a intentar. | No aparece un consultorio sin titular. El reintento válido obtiene un único alta completa. |
| Acceso | El límite de suscripción devuelve `not_required`. | La titular nueva puede operar sin suscripción; HU-026 no inicia la prueba. |
| Acceso | El límite de suscripción devuelve `verified`. | La titular nueva puede operar según su membresía. |
| Acceso | El límite devuelve `pending` o lanza un error y la titular invoca una página, acción o API operativa. | Retoma el onboarding; el servidor rechaza la operación sin efectos persistidos ni inicio de prueba. |
| Regresión | Una titular de un consultorio existente vuelve a entrar y opera como antes. | Conserva su acceso y no se la redirige a un alta nueva. |

Usar identidades de prueba y, para persistencia, concurrencia o migraciones, Postgres descartable. No usar datos de desarrollo, credenciales reales de pago ni WhatsApp real. Devolver por caso: commit probado, comando, código de salida, salida del runner, efectos persistidos observados a través de la interfaz y cualquier caso no ejecutado. La verificación con Mercado Pago queda pendiente de HU-029.

Fuera de alcance: invitaciones, conexión de WhatsApp, Google Calendar o Mercado Pago de señas y cobro de la suscripción.
