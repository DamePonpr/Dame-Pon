# Dame Pon

Dame Pon es una app de viajes compartidos tipo ride-hailing para Puerto Rico. El producto incluye dos apps móviles Expo/React Native —una para pasajeros y otra para conductores— y un API server Express.

## Estructura del monorepo

El repositorio usa pnpm workspaces.

- `artifacts/dame-pon-pasajero/` — app móvil para pasajeros.
- `artifacts/dame-pon-conductor/` — app móvil para conductores.
- `artifacts/api-server/` — API server Express. En producción escucha en el puerto `8080`; el health check es `GET /api/healthz`.
- `supabase/migrations/` — migraciones de esquema, políticas y funciones de base de datos.
- `supabase/functions/trip-push/` — función Edge que envía notificaciones push mediante Expo.
- `.github/workflows/android-apk.yml` — builds Android de preview.
- `.github/workflows/keepalive-supabase.yml` — actividad periódica contra la API pública de Supabase, cada dos días.

## Backend y datos

El backend usa el proyecto Supabase **Dame Pon**, en la región `us-east-1`:

- **Auth** para autenticación.
- **Postgres** como base de datos, con Row Level Security (RLS).
- **Realtime** para cambios de viajes y actividad en vivo.
- **Storage** con dos buckets: `driver-documents` es privado y `profile-media` es público.
- La función Edge `trip-push` envía notificaciones push a través de Expo.

Las tablas principales son `profiles` (roles `pasajero`, `conductor` y `admin`), `drivers`, `vehicles`, `trips`, `trip_offers`, `ratings`, `payments`, `fare_rules`, `municipios` (78 municipios), `incidents`, `support_cases`, `driver_documents`, `vehicle_documents`, `driver_agreement_acceptances`, `driver_activation_codes` y `keepalive_ping`.

En `drivers`, `approval_status` y `status_kind` representan estados actuales; el campo `status` se conserva por compatibilidad con código heredado.

## Ciclo de viaje

El flujo de negocio es:

`requested` → `offered` → `accepted` → `arrived` → `in_progress` → `completed`

El viaje también puede terminar como `cancelled`. Las transiciones protegidas se realizan mediante las funciones RPC `accept_trip`, `start_trip`, `complete_trip` y `cancel_trip`. `start_trip` valida el PIN del pasajero.

## Variables de entorno y secretos

- `EXPO_PUBLIC_SUPABASE_URL` — URL del proyecto Supabase.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — llave pública publishable para las apps; no usar una llave `secret` en el cliente.
- `DATABASE_URL` — conexión PostgreSQL usada por el API server.

No pegues secretos ni valores de credenciales en el repositorio. Configura secretos en el gestor de Secrets del entorno correspondiente.

## Comandos útiles

Desde la raíz del monorepo:

- `pnpm run typecheck` — comprueba tipos en los paquetes.
- `pnpm --filter @workspace/dame-pon-pasajero run verify:supabase-config` — valida la configuración pública de Supabase para la app del pasajero.
- `pnpm --filter @workspace/dame-pon-pasajero run verify:trip-realtime` — comprueba la configuración y resiliencia de Realtime para viajes.
- `pnpm --filter @workspace/dame-pon-pasajero run verify:rls-hardening` — verifica reglas de seguridad RLS.
- `pnpm --filter @workspace/api-server run dev` — compila e inicia el API server en modo desarrollo.

El API de producción se compila con `pnpm --filter @workspace/api-server run build` y se inicia desde `artifacts/api-server/dist/index.mjs`, con `PORT=8080`.

## Builds Android

GitHub Actions, mediante `android-apk.yml`, genera APKs de preview firmados con la llave debug. Antes de distribuir en Play Store, hay que configurar la firma de producción.

El workflow `keepalive-supabase.yml` realiza actividad a través de la API pública de Supabase cada dos días. Una consulta SQL administrativa por sí sola no cuenta como tráfico de API para este propósito.

## Consideraciones importantes

- `trip-push` filtra conductores por `drivers.status = 'aprobado'`, además de las demás reglas de elegibilidad. Ese campo heredado todavía afecta el despacho de notificaciones.
- La vista `passenger_trips` usa `security_invoker`; sus consultas respetan los permisos y RLS del usuario que la consulta.
- Las funciones trigger de Postgres son funciones internas: no son ejecutables directamente mediante la API.
- En Supabase Auth falta activar la protección contra contraseñas filtradas; se configura en el dashboard de Supabase.
- Las tablas de respaldo de los esquemas `respaldo_20260920` y `respaldo_20260922` son temporales.

## Pendientes conocidos

- Crear/configurar un usuario administrador.
- Cargar las tarifas reales; actualmente solo existe una regla de ejemplo.
- Integrar pagos con tarjeta.
- Configurar firma de producción para publicar en Play Store.
