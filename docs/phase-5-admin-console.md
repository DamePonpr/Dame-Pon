# Fase 5 — administración preparada, NO activada

## Estado y límites

El panel independiente está en `artifacts/dame-pon-admin`, ruta `/admin/`.
La interfaz y el API están implementados, pero **no administran el Supabase
remoto hoy**. La configuración devuelve `enabled:false`; no se construye el
cliente Auth, no se muestran números simulados ni se permite iniciar sesión.
No se crearon cuentas, contraseñas, roles, tarifas o cargos. No se aplicó SQL,
no se consultaron pagos reales y no se publicó.

Las apps móviles, el seguimiento GPS y las cotizaciones conservan sus compuertas.
El único ajuste funcional a un borrador anterior corrige la elegibilidad del
vehículo: el enum histórico real usa `active`, no `approved`. Su prueba local
ahora utiliza ese enum en vez de texto libre.

### Verificación actualizada de la interfaz

El bloqueo anterior de navegador fue superado con Chromium local y servidores
aislados en `127.0.0.1`; las identidades, rutas y respuestas eran ficticias y el
navegador solo permitió conexiones loopback. Los resultados detallados y las
capturas por escenario están en `docs/ui-verification-phase4-phase5.md` y
`generated-artifacts/ui-evidence/`. Esto no activa ni sustituye la autenticación,
RLS o Storage reales.

## Áreas implementadas

- Resumen: pendientes, incidentes/casos abiertos y viajes activos reales del API.
- Conductores: cola priorizada por pendientes, municipio/estado, documentos,
  motivo de revisión, aprobación, rechazo y suspensión.
- Vehículos: consulta, documentación, activación, fuera de servicio y retiro.
  La matrícula se muestra solo al administrador autorizado; no se incluye VIN.
- Incidentes: severidad/descripción, clasificación, revisión, resolución,
  cierre/reapertura y asignación a administradores existentes.
- Soporte: asunto, prioridad, estado, asignación y eventos con actor/motivo.
  No se implementa un chat de soporte.
- Viajes: consulta mínima, municipios, estado, fechas e importe registrado;
  sin PIN, direcciones precisas, coordenadas ni acciones operativas.
- Tarifas/cotizaciones: exclusivamente lectura; las reglas legacy se marcan
  como no aprobadas. Las tablas de Fase 4 son opcionales para la consulta.

Listas paginadas (máximo 100), detalles, carga, vacío, error/reintento, confirmación
y motivo obligatorio de 10–1000 caracteres. Las acciones se confirman solo tras
una respuesta válida del servidor; no hay aprobaciones optimistas ficticias.
La interfaz no sustituye los formularios de registro del propietario.

## Autorización y documentos

El API usa la llave **pública publishable** y el JWT de la persona; nunca una
service-role ni un usuario SQL privilegiado para atender el panel. En cada
solicitud verifica el usuario en Auth, su propio perfil admin y la RPC
`admin_console_session`. Las RPC vuelven a comprobar `auth.uid()`/`is_admin()`;
sus funciones auxiliares no se ofrecen como entradas públicas.

El cliente conserva sesión solo en memoria, sin registro de usuarios nuevos,
sin persistir tokens o URLs privadas. Vincula la sesión verificada a la identidad
actual, limpia consultas al cambiar de cuenta y oculta datos ante 401/403.
Las acciones llevan revisión esperada y clave idempotente: un reintento no
duplica la decisión; una revisión vieja o un payload distinto produce conflicto.

Para abrir un documento:

1. La RPC valida administrador, ID, propietario, ruta, revisión y motivo.
2. Registra la apertura y emite un permiso de lectura de Storage de 60 segundos
   para ese administrador y esa ruta, sin conceder SELECT global sobre el bucket.
3. El API lee solo un prefijo del archivo con ese mismo JWT, comprueba firma
   JPEG/PNG/PDF y Content-Type, y solicita una URL firmada de 60 segundos.
4. Devuelve solo URL/expiración con `no-store`; nunca una URL pública alternativa.
   El navegador abre con `noopener`, `noreferrer` y sin referrer.

Los archivos referenciados por documentos o por evidencia auditada no pueden
sobrescribirse o borrarse por clientes autenticados. La aprobación documental
exige apertura reciente de la misma revisión/ruta. La auditoría es append-only.
Una URL firmada ya emitida sigue siendo un bearer hasta su vencimiento, incluso
si la persona cierra sesión: no debe compartirse ni registrarse en logs.
Validar cabecera/firma no es antivirus ni acredita autenticidad legal del PDF.

No se amplía SELECT sobre `drivers` ni sobre viajes para pasajeros/conductores.
Los DTO administrativos son cerrados y no incluyen licencia, GPS ni PIN.
Las políticas administrativas heredadas no se convierten en un sistema granular
de permisos por operador; deben inventariarse en staging antes de habilitar.

## SQL pendiente — nunca autoaplicable

Todo está fuera de `supabase/migrations`, en `docs/phase5-drafts/`:

1. `001_admin_foundation.sql`: auditoría, tickets privados, revisiones de
   registros, asignación de incidentes, protección de campos privilegiados,
   evidencia inmutable, lectura de resumen/sesión/responsables. Conserva lectura
   propia de documentos y cargas en rutas únicas. Retira escritura directa de
   tarifas legacy y de estados administrativos a `authenticated`.
2. `002_admin_reads.sql`: listas/detalles mínimos y eventos, sin rutas de Storage.
3. `003_admin_actions.sql`: transiciones con motivo, revisión, bloqueo e
   idempotencia; apertura auditada; aprobación documental/vehicular/conductor.
4. `004_admin_assignment_race.sql`: comprueba y bloquea la fila del conductor
   al asignarlo, para cerrar la carrera entre aceptar y suspender. No exige GPS
   fresco ni enciende la compuerta de Fase 2 ni sustituye `accept_trip`.

Cada archivo es transaccional. Requieren reconciliar A1, políticas B y onboarding
históricos con el esquema real; las pruebas también cargan el GPS pendiente
localmente. No son scripts idempotentes para ejecutar a ciegas.

La aprobación de conductor exige vehículo activo, paquete documental existente
aprobado/vigente y las cinco aceptaciones de acuerdos del onboarding. Conserva
el rol y documentos y deja al conductor offline. El rechazo utiliza
`pending_documents` + motivo/auditoría porque el enum real no contiene rejected.
Suspender o desactivar vehículo se rechaza si hay viaje activo. Desactivar el
vehículo suspende disponibilidad del conductor en la misma transacción y genera
un evento vinculado en su historial, además del evento del vehículo.

Los acuerdos existentes siguen siendo borradores; esta comprobación técnica no
los convierte en contratos legalmente aprobados. Si un documento antiguo no tiene
fecha de vencimiento, no se inventa una. Faltan requisitos comerciales/legales de
vigencia y un proceso periódico de renovación; no hay suspensor automático.

## Habilitación futura, solo con autorización

Mantener `DAME_PON_ADMIN_ENABLED` ausente/false. **No se estableció esta variable.**
Una habilitación futura requiere URL HTTPS y
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, reconciliación SQL, cuenta administradora
legítima ya autorizada y aprobación explícita de las pruebas de staging.
El secreto de servidor de cotizaciones de Fase 4 no se reutiliza en este panel.

Plan de ensayo:

1. Inventariar columnas/enums, grants y políticas de Storage; comprobar bucket
   privado, compatibilidad de subida única y conservación de archivos existentes.
   Respaldar esquema/políticas y datos; no copiar documentos sensibles al fixture.
2. Aplicar los borradores, en orden, solo en un entorno aislado autorizado.
   Probar JWT reales de anon/pasajero/conductor/admin: REST, RPC y Storage directo,
   antes/después del ticket, expiración y revocación de rol. Probar firma y Range
   reales de Storage, Content-Type y apertura segura de imágenes/PDF.
3. Recorrer interfaz autenticada en desktop y móvil: cola, página vacía/error,
   apertura, decisión confirmada, conflicto/reintento, asignación y trazabilidad.
   La prueba de navegador de este turno no cubrió estas pantallas protegidas.
4. Probar aprobación completa, paquetes incompletos/vencidos, resubmisión de
   documentos y edición de vehículos. No invalidar un viaje activo. Enviar dos
   decisiones y una aceptación/suspensión concurrentes con clientes separados.
5. Repetir en Android físico el registro/municipio, subida y reenvío de documentos,
   conductor antiguo sin timestamp GPS con compuerta apagada, GPS disponible/
   offline, aceptación y finalización/cancelación. Verificar que no se corta
   ubicación de un viaje y que no se expone GPS de otra persona.
6. En un navegador estable, completar los cuatro flujos pendientes de Fase 4 con
   backend interceptado. No habilitar tarifas, GPS o cotizaciones por probar el
   panel ni utilizar la regla de ejemplo para generar precios cobrables.

Rollback: apagar primero el flag del panel y retirar su acceso. Conservar
auditoría, tickets/evidencia y revisiones; dejar vencer URLs ya emitidas.
Revertir interfaz/API a una versión compatible sin quitar barreras GPS/cotización.
Si una restricción impide una operación legítima, preparar una migración
correctiva transaccional y probarla antes de autorizarla: no DROP, TRUNCATE,
borrado de documentos, restauración indiscriminada de grants ni desactivar RLS.
Mantener las operaciones afectadas deshabilitadas hasta resolver la causa.

## Verificaciones ejecutadas

- **170 pruebas locales aprobadas, cero fallos**, incluyendo 19 nuevas de
  administración: PostgreSQL desechable (RLS/RPC/Storage metadata), HTTP loopback,
  JWT/Storage simulados, revisión/autoría, idempotencia y concurrencia.
- Comando: `node --experimental-strip-types --test --test-concurrency=1
  packages/shared/tests/*.test.mjs artifacts/dame-pon-pasajero/scripts/*.test.mjs
  artifacts/dame-pon-conductor/scripts/*.test.mjs`.
- La ejecución paralela inicial agotó 30 s al inicializar PostgreSQL mientras
  compilaba; la ejecución completa en serie pasó sin cambiar las comprobaciones.
- `pnpm run typecheck`, build API y build Vite admin aprobados. Vite avisa de
  sourcemaps de tres componentes y chunk mayor de 500 KB; no impide el build.
- Android e iOS de ambas apps: cuatro exports Expo locales completos; no son APK
  instalados, firma de tienda ni releases.
- API de desarrollo en 8080 y pantalla pública apagada del panel comprobados.
  Captura móvil 402×874: legible, sin datos simulados ni login activo.
- Aviso conocido de Expo: falta libglib para RN DevTools opcional; Metro corre.
- No se ejecutaron verificadores que escriben en Supabase remoto, ni migraciones,
  ni inspección real de documentos, ni pruebas en dispositivo físico.

### Resultado de navegador con servicios de prueba

- Acceso admin sintético permitido; usuario sintético no administrador denegado.
- Aprobación/rechazo/suspensión de conductor y estados de vehículo con motivo y
  eventos auditados de fixture; conflicto por revisión antigua sin evento nuevo.
- Solicitud de URL documental efímera, expiración visible, error sin revelar
  enlace, y recuperación con un nuevo enlace de prueba. No se abrió Storage real.
- Incidentes y soporte: asignación, cambios de estado e historial ficticios.
  Viajes y tarifas/cotizaciones permanecieron sin controles de escritura.
- A 390×844, el panel no tuvo overflow horizontal y mantuvo separadas las
  secciones de conductores y viajes.
- Esta simulación no autentica JWT contra Supabase ni prueba RLS, RPC, Storage,
  revocación real de rol, staging autorizado o dispositivos físicos. La API local
  sigue devolviendo `enabled:false` fuera del harness.
