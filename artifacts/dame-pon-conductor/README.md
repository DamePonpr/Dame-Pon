# Dame Pon

## Configuración pública de Supabase

La app necesita estas variables en **Replit Secrets**:

- `EXPO_PUBLIC_SUPABASE_URL`: la URL HTTPS del proyecto.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: la llave **Publishable** actual de Supabase, cuyo valor comienza con `sb_publishable_`.

No uses una llave JWT heredada (`eyJ...`) ni una llave secreta (`sb_secret_...`). Las variables
`EXPO_PUBLIC_*` se incluyen en la aplicación móvil y, por definición, no son privadas.

Configura o reemplaza los valores directamente en **Replit Secrets**. Nunca pegues llaves,
contraseñas ni otros secretos en el chat, en archivos del repositorio o en capturas de pantalla.
Después de cambiar una variable, reinicia el workflow de Dame Pon.

Puedes comprobar únicamente el formato de la configuración, sin imprimir sus valores, con:

```sh
pnpm --filter @workspace/dame-pon-conductor run verify:supabase-config
```

## Comprobación integral del viaje en tiempo real

La prueba usa dos cuentas de Supabase Auth dedicadas y distintas. Ambas deben existir,
tener el correo confirmado y usar los roles `pasajero` y `conductor`, respectivamente.
Guarda sus credenciales únicamente en Replit Secrets:

- `SUPABASE_RLS_PASSENGER_EMAIL`
- `SUPABASE_RLS_PASSENGER_PASSWORD`
- `SUPABASE_RLS_DRIVER_EMAIL`
- `SUPABASE_RLS_DRIVER_PASSWORD`

Para verificar solicitud, aceptación, inicio, finalización y calificación sin recargas
manuales:

```sh
pnpm --filter @workspace/dame-pon-conductor run verify:trip-realtime
```

La prueba falla si un canal no queda suscrito o si una actualización no llega a ambas
sesiones dentro del tiempo límite. Cada paso informa si se observó mediante el evento
Realtime o mediante la reconciliación automática. La garantía comprobada es que las
pantallas convergen sin una recarga manual incluso si Realtime pierde un evento.

La comprobación de endurecimiento RLS también valida el contrato del RPC
`get_trip_participant_details` para las dos sesiones autenticadas. Si la migración
del RPC no fue aplicada en el proyecto remoto, la prueba falla en vez de dejar que
la pantalla de finalización muestre datos incompletos:

```sh
pnpm --filter @workspace/dame-pon-conductor run verify:rls-hardening
```

Las credenciales de esa prueba deben pertenecer a un pasajero y un conductor de
prueba distintos; no tienen que ser los participantes de un viaje histórico real.

Si el conductor aprobado y conectado no puede leer solicitudes con estado
`requested` u `offered`, aplica primero la migración:

```text
supabase/migrations/20260906120000_allow_approved_drivers_to_view_open_trips.sql
```

La política solo amplía la lectura de solicitudes todavía abiertas; no expone viajes
`accepted`, `arrived`, `in_progress` ni `completed` a usuarios ajenos.

Para permitir que ese conductor reclame una solicitud abierta mediante una función
controlada que conserva pasajero, ruta y tarifa, aplica también:

```text
supabase/migrations/20260906121000_allow_approved_drivers_to_accept_open_trips.sql
```

Si anteriormente se aplicó una política `UPDATE` para la aceptación, aplica la
migración correctiva que la elimina y crea el RPC seguro:

```text
supabase/migrations/20260906123000_secure_trip_acceptance.sql
```

Para que cada participante pueda calificar únicamente a la otra persona después de
completar el viaje, aplica:

```text
supabase/migrations/20260906122000_allow_trip_participants_to_rate_each_other.sql
```