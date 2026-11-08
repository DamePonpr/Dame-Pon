# Fase 2 GPS: preparación, seguridad y activación

## Estado y alcance

**Solo preparado en código. Ninguna de estas migraciones se aplicó a Supabase,
staging o producción. No se publicó la app ni la edge function.**
Las verificaciones de esta revisión usan exclusivamente archivos, adaptadores
locales y un PostgreSQL temporal sin TCP ni credenciales del proyecto.

Migraciones pendientes, en este orden:

1. `20261108020000_driver_foreground_presence.sql`: expansión, sesiones GPS,
   lectura mínima y cierre de exposición privada. No exige GPS al despacho.
2. `20261108021000_driver_gps_rollout.sql`: sincronización transaccional del
   estado de viaje y compuerta de frescura **apagada por defecto**.

No se cambian las firmas ni cuerpos de `accept_trip`, `start_trip`,
`complete_trip` o `cancel_trip`. Tampoco se modifican perfiles, roles,
documentos, tarifas, pagos ni coordenadas históricas. No hay backfill GPS.

## Privacidad: REST, RPC y Realtime

- Se elimina exclusivamente `assigned_passenger_can_view_driver_location`.
  RLS filtra filas, no columnas: conceder esa fila expondría licencia/notas.
  Se conserva la política del conductor para consultar su propio registro.
- `get_assigned_driver_location(trip_id)` comprueba identidad/rol pasajero,
  propiedad del viaje, conductor asignado y estado activo. Devuelve solo
  `driver_id`, latitud, longitud, fecha GPS e indicador online. No recibe
  un conductor arbitrario para ampliar el alcance.
- Estados activos admitidos de forma consistente: `accepted`, `arrived`,
  `in_progress`, `aceptado`, `en_curso`. Al completar/cancelar no hay resultado.
- Las coordenadas son NULL si falta una sesión vigente, se revocó, está offline,
  no está aprobado o venció la lectura. Tanto recepción como muestra admitida
  deben tener menos de 45 s. La fecha presentada usa la menor de ambas fechas.
  El cliente también oculta coordenadas inválidas, NULL, vencidas o de otro ámbito.
- Se retira `drivers` de `supabase_realtime`, sin tocar la publicación de trips.
  No se emiten filas privadas ni imágenes antiguas de DELETE. Si la publicación
  utiliza ALL TABLES o todo el esquema public, la migración falla cerrada:
  resolver esa configuración con autorización antes de continuar.
- El pasajero consulta la RPC cada 10 s y al recuperar foco. Ya no se suscribe
  a filas `drivers`. El Realtime de viajes sigue funcionando.
- Las tablas de control/sesiones y compuerta tienen RLS sin políticas de cliente,
  además de REVOKE de privilegios para PUBLIC/anon/authenticated. No se publican.
  Un JWT admin de la app no constituye una vía para activar la compuerta.

**Compatibilidad deliberada:** una versión antigua que consulte directamente
`drivers` para mostrar GPS de otra persona deja de obtener esa fila. No se puede
preservar esa vía insegura. El perfil propio del conductor permanece accesible;
las versiones nuevas usan la RPC mínima. Verificar vistas y pantallas antiguas
en staging; no reabrir SELECT privado como solución.

## Sesión, generación y orden

1. La app obtiene permiso y GPS real antes de reservar una sesión.
2. `open_driver_presence_session()` deriva usuario/rol de Auth, exige aprobación
   y el claim autenticado `session_id`, genera un UUID servidor y reserva la
   generación actual. **Reservar no conecta ni cambia disponibilidad.**
3. La primera publicación activa mediante compare-and-swap de generación.
   Otra reserva anterior no puede reemplazar una generación ya activada.
4. Cada publicación incluye el token de sesión y secuencia estrictamente
   creciente. El servidor bloquea la fila del conductor, verifica dueño,
   sesión Auth, revocación, generación actual, secuencia y antigüedad/orden GPS.
5. Offline revoca permanentemente ese token, incluso si aún no publicó GPS.
   Una baja vieja no desconecta una sesión nueva. Un inicio/publicación tardíos
   con token revocado no reactivan al conductor.
6. Una reserva que llega después de cancelar localmente solo se cierra.
   Si la respuesta de reserva se pierde completamente, la reserva huérfana
   permanece inactiva: nunca estuvo autorizada para publicar por sí sola.

Límites: muestras de -20 s a +10 s, coordenadas finitas/en rango; publicaciones
normales mínimo 10 s en cliente y 8 s en servidor; heartbeat 25 s; reserva como
máximo cada 2 s. No se acumula un historial de puntos para reintentar.
Las escrituras legacy propias siguen permitidas, pero cambiar coordenadas o
disponibilidad mediante REST invalida la fecha GPS: no pueden fabricar frescura.
Un conductor sin aprobar no puede reservar/publicar online.

Las filas de sesión son metadatos privados y conservan las revocaciones.
No se ha añadido una tarea de retención. Definirla posteriormente sin borrar
sesiones actuales ni reutilizar tokens; supervisar crecimiento durante el piloto.

## Viaje y disponibilidad

Un trigger AFTER sincroniza `status_kind` en la **misma transacción** del viaje:
ocupado con viaje activo, disponible si sigue online al completar/cancelar,
offline si ya estaba offline. No modifica la fecha GPS. Un rollback de la
operación del viaje revierte también esta sincronización.
El índice único existente protege viajes modernos simultáneos por conductor.
Comprobar que no existan conflictos heredados antes de activar; no corregirlos
borrando registros. Los triggers no se exponen como RPC ejecutables.

## Primer plano y límites del dispositivo

No existe una tarea de segundo plano compatible implementada. Se mantiene GPS
en primer plano; minimizar detiene el seguimiento y exige reactivación explícita.
Cerrar sesión espera la baja antes de retirar credenciales. La limpieza es
idempotente. Si no se confirma la baja por red, se informa y la lectura del
pasajero caduca; el proceso muerto no puede confirmar una baja.

El arranque no resetea la disponibilidad remota de un cliente legacy ni
desconecta otro dispositivo: no se modifica el servidor sin token propio.
La nueva app empieza localmente No disponible y no reutiliza GPS histórico.
No se puede garantizar identidad física del GPS de un cliente manipulado:
el servidor comprueba autorización/orden/edad, no una certificación de hardware.

## Compuerta y los dos conductores legacy

`driver_gps_rollout.enforce_fresh_gps=false` por defecto.
`driver_gps_cohorts` permite exigir frescura solo a conductores piloto.
Solo las credenciales de operación autorizadas/owner pueden administrar estas
tablas; la app y un pasajero no pueden cambiar la configuración.
Si desaparece la fila de configuración, el servidor exige frescura en vez de
desactivarla silenciosamente. El valor inicial OFF es una fila explícita.

Mientras ambos controles estén apagados, clientes anteriores con
`is_online=true` y fecha NULL conservan lectura/aceptación existentes. No
inventarles coordenadas ni timestamps. La última auditoría encontró dos
registros aprobados online; **no es una cifra fija ni prueba de GPS real**.
Recontar antes del rollout, con autorización, y actualizar ambos clientes antes
de incluirlos en una cohorte estricta.

El modo compatible todavía NO garantiza GPS reciente al aceptar para todos.
Una cohorte estricta rechaza con 42501 si la presencia falta/caducó. Los viajes
ya asignados permanecen consultables y se pueden iniciar con PIN/finalizar/
cancelar aunque caiga el GPS. No activar globalmente con clientes antiguos.

## Notificaciones sin avisos engañosos

Código edge pendiente: `trip-push` consulta exclusivamente
`get_fresh_driver_push_targets()` (RPC reservada a service_role). Comprueba rol,
aprobación moderna, disponibilidad, sesión vigente, frescura y coordenadas.
Conserva autorización del actor del viaje y radio de 20 km. Ante error o RPC
ausente falla cerrado, sin fallback a `status/is_online` históricos.

Orden futuro: primero expansión, luego edge actualizada, luego móviles/piloto
y al final compuerta. Hasta desplegar la edge nueva, la versión remota antigua
todavía podría enviar avisos engañosos: suspender externamente esos avisos o
mantener el rollout detenido con autorización; NO afirmar que este commit los
cambió remotamente. Una vez actualizada, clientes legacy sin GPS confirmado
NO reciben pushes nuevos aunque el modo compatible les deje consultar/aceptar.
Es una degradación explícita de avisos, no una simulación de presencia.

## Pruebas locales reproducibles

```sh
node --experimental-strip-types --test packages/shared/tests/driver-tracking.test.mjs
node --test packages/shared/tests/gps-contract.test.mjs
node --test packages/shared/tests/gps-database.test.mjs
node --experimental-strip-types --test packages/shared/tests/*.test.mjs artifacts/dame-pon-pasajero/scripts/*.test.mjs artifacts/dame-pon-conductor/scripts/*.test.mjs
pnpm run typecheck
```

`gps-database.test.mjs` requiere initdb/pg_ctl/psql locales. Crea un cluster
temporal con socket Unix, TCP desactivado y entorno sin DATABASE_URL/secretos.
Ejecuta ambos archivos SQL en transacciones locales, reutiliza las definiciones
existentes de las cuatro RPC de viaje y limpia el cluster al terminar.
Prueba SELECT/UPDATE bajo roles equivalentes a REST, RLS y RPC reales de
PostgreSQL, publicación, herencia de grants amplios, compuertas, rollback,
sesiones Auth simuladas y conexiones concurrentes reales.
No levanta PostgREST ni Realtime de Supabase: eso sigue pendiente de staging.

`gps-contract.test.mjs` ejecuta el servicio y handler edge TypeScript reales
con adaptadores cerrados locales. Comprueba parámetros/token/secuencias,
revocación, autorización de avisos y ausencia de fallback. No envía push real.
Las pruebas del controlador cubren GPS/permisos/red/vida útil, cancelación
temprana y reserva tardía. No son prueba de hardware Android.

## Plan de staging (NO ejecutado; requiere autorización separada)

1. Preparar un entorno aislado con el esquema real completo y cuentas de ensayo,
   sin copiar secretos ni datos personales de producción. Comparar historial,
   ACL/owners, índices, triggers, publicación, enums y vistas. Guardar DDL
   original para diagnóstico. Verificar funciones de aprobación y permisos.
   Incluir baja/eliminación de cuenta: las nuevas tablas privadas tienen
   dependencias FK y deben integrarse con el procedimiento de retención real.
   La expansión aborta si ya existe cualquier firma de `publish_driver_presence`:
   reconciliarla explícitamente; no dejar un overload antiguo que omita el fencing.
2. Comprobar que publicaciones sean explícitas y que ningún mecanismo adicional
   emita filas privadas. Probar acceso REST `drivers?select=*` y suscripción
   directa Realtime como pasajero propio/ajeno/anon. Cero campos privados.
3. Aplicar cada archivo **transaccionalmente**, con lock_timeout/statement_timeout
   acordados, y comprobar recarga de esquema PostgREST y contratos RPC. No
   repetir CREATE TRIGGER a ciegas tras un error: reconciliar historial/efectos.
4. Con compuerta apagada, validar dos clientes legacy online con fecha NULL,
   perfil/documentos/municipios, y aceptar/iniciar con PIN/completar/cancelar.
   No modificar estados o roles para “hacer pasar” la prueba.
5. Validar REST/RPC/Realtime con dos pasajeros y dos conductores; tokens de otra
   sesión, reserva tardía, secuencia repetida/invertida, Stop concurrente,
   muestra/recepción vencida y ausencia de coordenadas al terminar.
6. Desplegar edge de ensayo y verificar cero pushes a presencia antigua,
   error cerrado si falta RPC y avisos solo a targets frescos/cercanos.
7. En Android físico: permisos precisos/aproximados/denegados, Ajustes, GPS
   apagado, movimiento/estacionario, red caída/recuperada, baja y logout con
   petición en curso, minimizar/bloquear/matar proceso y dos dispositivos.
   El mapa web es una referencia, no prueba del mapa nativo MapLibre.
8. Activar una cohorte piloto, observar rechazos 42501, errores RPC, latencia,
   caducidad, frecuencia de escrituras y avisos. Revertir si hay regresiones.
   Activar globalmente solo con móviles compatibles y consentimiento explícito.

## Rollback correctivo sin borrar registros

Plantilla **no automática**, fuera del directorio de migraciones:
`docs/sql/phase-2-gps-disable-enforcement.sql`. Solo apaga compuerta global y
cohortes en una transacción. Conserva sesiones, viajes, filas de cohorte, RPC,
columna, RLS privada y frescura de avisos. No reabre SELECT del pasajero sobre
drivers, no vuelve a publicar esa tabla y no desactiva RLS.

Si falla el SQL antes del commit, exigir rollback transaccional del ejecutor.
Si falla después del commit, usar la corrección autorizada y diagnosticar:
no DROP de columnas/RPC usadas por móviles nuevos ni restauración total que
pueda perder viajes posteriores. Si la causa es sincronización de estados,
preparar una corrección específica del trigger, no borrar filas ni alterar
roles. No se entrega un “down” automático que reintroduzca la fuga privada.
