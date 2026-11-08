# Fase 4 — cotización fija, no cobros

## Estado y restricciones

Implementación local con compuertas **apagadas por defecto**. No se aplicaron
migraciones, no se consultaron/escribieron pagos ni datos de Supabase remoto, no
se publicaron tarifas, builds/release ni despliegues. Los scripts SQL nuevos
están exclusivamente en `docs/phase4-drafts/`, fuera de `supabase/migrations/`.
Los scripts de verificación remota que crean viajes NO se ejecutan aquí.

La regla existente “Regla de ejemplo Dame Pon” NO se importa al motor. El motor
no lee `fare_rules`: exige versiones comerciales independientes, aprobación
explícita y sin valores predeterminados. No se convierte una regla de ejemplo
en un precio oficial cambiándole el nombre. No se crean cuentas administradoras.
Las cuentas/roles/tarifas/polígonos sintéticos de las pruebas solo existen en
procesos PostgreSQL desechables locales, jamás en las aplicaciones o Supabase.

## Arquitectura

- Contrato OpenAPI: `/api/quotes`, `/api/quotes/confirm`; JWT Bearer obligatorio
  cuando el servicio está habilitado. Zod generado, rechazo de campos extra,
  incluidos los anidados. No acepta usuario, municipio, precio, km o segundos.
- Express verifica el token con Supabase Auth, consulta el perfil propio con
  ese JWT y exige rol pasajero. El actor de los RPC privados sale de esa
  verificación, nunca del body. No usa `DATABASE_URL` ni la base Replit para
  sustituir Supabase. Las credenciales y cuerpos no se registran en logs.
- Solo los RPC privados del servidor pueden recibir métricas. `authenticated`
  NO puede invocarlos por REST; `service_role` solo recibe EXECUTE específico,
  no permisos generales sobre las tablas nuevas.
- Municipios: coincidencia única en **polígonos previamente aprobados y
  versionados**, con su ID presente en el catálogo existente. No usa el municipio
  enviado por cliente ni `find_nearest_municipio`: centroide no demuestra límites.
  Se rechazan fronteras ambiguas, solapamientos, huecos y falta de cobertura.
  No se han cargado polígonos reales. Antes de activar, revisar su procedencia,
  topología y vigencia; validar una geometría no prueba su corrección legal.
- Vehículo: v1 solo sedan, sin asumir otras categorías. El backend selecciona
  una versión específica de municipio de origen o una global; la ambigüedad
  bloquea. Para aceptar un viaje cotizado se exige exactamente un vehículo
  aprobado registrado al conductor, de esa categoría. Los viajes legacy no
  reciben esa barrera nueva.
- OSRM se consulta desde el servidor, reutilizando el parser de rutas de fase 3
  y sus validaciones, caché y límites. No usa GPS privado del conductor, distancias
  rectas ni métricas del cliente. El hash SHA-256 de geometría y métricas/extremos
  vinculan la cotización al cálculo. No se promete reconstrucción histórica de
  la geometría completa desde el hash ni replay de un grafo OSRM cambiante.

## Dinero y decisiones comerciales explícitas

Se conservan métricas cuantizadas a milímetros/milisegundos (redondeo al entero
más cercano), no los km/minutos formateados en pantalla. Cálculo racional con
BigInt en TypeScript y numeric en PostgreSQL, USD y total entero en centavos:

`max(mínimo, base + tarifa_km × distancia_mm/1.000.000 + tarifa_min × duración_ms/60.000)`

El total se redondea **una sola vez**, HALF_UP al centavo. Los componentes del
desglose guardan numerador/denominador exactos; la UI identifica sus aproximaciones.
SQL vuelve a calcular y rechaza cualquier discrepancia del servidor. Máximo
técnico compatible con `trips.numeric(8,2)`: 99.999.999 centavos, no una tarifa.

Este algoritmo solo es elegible si un administrador autorizado aprueba
explícitamente `minimum_policy=floor_total`,
`night_policy=explicitly_not_applicable`, USD y `fixed-route-v1`. No es una
decisión comercial tomada por el código: sin ese consentimiento no hay versión.
Un recargo nocturno positivo o una política desconocida NO se transforma en cero;
no se admite en v1 y bloquea la aprobación/cotización.

Faltan decisiones del negocio: importes reales, aplicabilidad/horario nocturno
en America/Puerto_Rico, otro orden del mínimo si se desea, cancelaciones, espera,
comisiones, impuestos/peajes/extras. No tienen importes ni porcentajes inventados.
No se calculan esos cargos ni descuentos. No hay captura, reembolso, retiro,
saldo, liquidación ni envío a proveedores de pago.

## Confirmación e invariantes

La cotización pertenece al pasajero e incluye extremos, categoría, áreas y
versión de regla aprobadas, copia inmutable del reglamento, desglose, métricas,
hash de ruta y vencimiento. Vigencia cinco minutos, según reloj PostgreSQL.
El cliente usa tiempo monotónico y descuenta conservadoramente la espera de red;
el servidor siempre vuelve a comprobar el vencimiento.

Confirmar acepta solo ID de cotización y clave UUID de idempotencia. El RPC
serializa por actor/clave, bloquea la fila, valida propietario/vigencia/uso,
reserva el ID del viaje y crea todo en una transacción con FK diferida. Repetir
la misma clave recupera el mismo viaje incluso después del vencimiento; otra
clave o usar la clave con otra cotización se rechaza. Un fallo de INSERT revierte
también el consumo. No hay mutación REST pública de cotizaciones.

El trigger final `zz_quote_trip_integrity`, después del asignador municipal
existente, conserva extremos, municipios verificados e importe. Al completar
con el RPC existente fija `fare_final` al total acordado. NO relee precios nuevos,
NO marca `payment_status` como pagado, NO escribe `payments`. Se conserva la
firma de accept/start/complete y su resultado existente. El importe se puede
ver en ambas apps durante el viaje y en el cierre usando los campos ya permitidos.

Las dos entradas de pasajero usan el control central `requestTrip`:
home y confirm-ride/book-ride/Payment. No se muestra el `amount` arbitrario del
componente antiguo. Con endurecimiento activo, error, edición, caducidad o
falta de regla bloquean confirmar; **no se cae al INSERT legacy**.
Después de confirmar se relee el viaje por `passenger_trips` bajo RLS existente.
Un cliente que intente evitar la app mediante REST queda sujeto al trigger.

## Tres controles independientes y compatibilidad

No se configuró ninguna de estas variables ni se cambió el estado remoto:

1. Servidor `DAME_PON_QUOTES_ENABLED=true`: habilita endpoints; por defecto
   devuelven indisponible sin llamar Auth, DB ni proveedor.
2. Base `quote_rollout.require_quotes=true` **y** pertenencia del pasajero a
   `quote_enforcement_cohorts`: piloto autorizado. Sin ambos, el actor no puede
   cotizar; el INSERT legacy permanece permitido para cuentas no enroladas.
   Solo operadores autorizados pueden gestionar esta tabla privada. Se guardan
   quién, cuándo y motivo, sin habilitación automática desde cliente.
3. Móvil `EXPO_PUBLIC_REQUIRE_SERVER_QUOTES=true`: habilita UI requerida en los
   dos flujos; sin cotización válida el usuario no confirma. Por defecto false
   conserva el flujo actual sin precio oficial y sin hacer llamadas de cotización.

Una misma cuenta enrolada no puede usar un APK antiguo para saltarse el control.
Por ello, enrolar solo pilotos cuyos dispositivos sean compatibles; no enrolar
la flota automáticamente. El master apagado preserva operación legacy.
Si la UI se habilita sin backend/BD/reglas listas, se muestra indisponible y se
bloquea (no se inventa precio ni se vuelve silenciosamente a legacy).

Configuración futura: Supabase URL HTTPS, publishable key para verificar Auth y
`SUPABASE_SERVICE_ROLE_KEY` **solo servidor**, nunca en variables EXPO_PUBLIC.
Native requiere `EXPO_PUBLIC_QUOTE_API_URL=https://<dominio-verificado>/api`;
web puede usar `/api`. Obtener el dominio publicado real al autorizar activación,
no construirlo desde el nombre del proyecto. No se solicitan/configuran llaves
en esta fase. Si falta configuración o RPC, la respuesta es indisponible.

## Administración

`002_admin_publish.sql` prepara funciones de publicación, no un panel operativo:
verificación `is_admin()`, razón de aprobación, actor real, tiempo y vigencia
finita explícita. Versiones y polígonos son append-only; no se pueden editar o
borrar para alterar contratos previos. Publicación serializada impide vigencias
superpuestas dentro del mismo ámbito. No se conceden escrituras generales a
authenticated ni a service_role. No se crean usuarios ni se cambia `profiles`.

Antes de producción: panel/revisión mínima para un administrador existente,
revisión independiente de decisiones y polígonos, y procedimiento de sustitución/
retirada mediante eventos correctivos auditados (no edición histórica). Por
ahora, publicar una sustitución exige vigencias no superpuestas; no hay interfaz
para acortar una versión ya aprobada. Desactivar nuevas emisiones es preferible
a borrar registros o modificar una tarifa ya acordada.

## Pruebas y staging (no ejecutado contra staging)

Verificaciones locales:

```sh
node --experimental-strip-types --test packages/shared/tests/*.test.mjs artifacts/dame-pon-pasajero/scripts/*.test.mjs artifacts/dame-pon-conductor/scripts/*.test.mjs
pnpm run typecheck
CI=1 pnpm --filter @workspace/dame-pon-conductor exec expo export --platform android --platform ios --no-minify --max-workers 2 --output-dir /tmp/dame-pon-phase4-conductor
CI=1 pnpm --filter @workspace/dame-pon-pasajero exec expo export --platform android --platform ios --no-minify --max-workers 2 --output-dir /tmp/dame-pon-phase4-pasajero
```

Los tests SQL crean un cluster nuevo con TCP apagado, socket privado y un
entorno que solo contiene PATH/HOME/locale, sin DATABASE_URL ni Secrets. Ejecutan
las definiciones existentes de lifecycle y GPS sin reescribirlas, más los
borradores, exclusivamente allí. Cubren RLS, RPC privado, precio inyectado,
propietario, caducidad, idempotencia/concurrencia, vehículo aprobado, congelación
al completar, privacidad GPS y compatibilidad de cuentas legacy.

Para staging futuro, con autorización separada:
1. Reconciliar esquema y migraciones reales, incluidos los pendientes GPS.
   No empujar todos los archivos pendientes juntos sin revisar sus dependencias.
2. Aplicar cada borrador completo **en transacción** en una base aislada, nunca
   por fragmentos (evita ventanas con EXECUTE público por defecto).
3. Validar con JWT reales de ensayo y REST, límites municipales oficiales,
   categoría/vehículo, callbacks fuera de orden, desconexión y pérdida de respuesta
   tras confirmar; comprobar recuperación del mismo viaje.
4. Probar Android físico en ambos flujos, caducidad al minimizar, cambio de cuenta,
   doble toque y clientes antiguos. No habilitar permisos GPS de fondo.
5. Validar capacidad: la cola por proceso/dispositivo NO limita una flota completa
   contra OSRM público. Requiere capacidad acordada o OSRM propio y límites
   agregados antes de uso masivo. No se cambió proveedor ni despliegue actual.
6. Cargar áreas y tarifas realmente aprobadas; no copiar ni aprobar automáticamente
   la regla de ejemplo. Preparar clientes, habilitar solo pilotos, observar.

Rollback correctivo: detener nuevas cotizaciones/enrolamientos y volver a modo
legacy solo por decisión explícita del operador. Conservar tablas, versiones,
cotizaciones y viajes creados; los viajes ya cotizados mantienen su protección
e importe al completarse aun apagando el master. No DROP, no borrado de historial,
no recalcular contratos y no marcar pagos cobrados. Resolver las cotizaciones
pendientes mediante soporte/expiración, no crear viajes duplicados.

## Lo que NO funciona todavía fuera de las pruebas

No hay tablas/RPC nuevos remotos, reglas comerciales aprobadas, límites
municipales revisados, llave privada de servidor configurada ni compuertas
activadas. Por eso no existe cotización comercial operativa hoy. No se ha
probado Android físico ni staging con JWT reales. Las pruebas HTTP/UI usan
fixtures, no pagos ni cuentas reales. El modo actual sin cotización sigue
siendo compatible; no se declara apto para cobrar.

## Resultado de la verificación local

- Suite completa: **146 pruebas aprobadas, 0 fallos**, incluidas las anteriores.
- `pnpm run typecheck`: aprobado; build del API y `/api/healthz` local correctos.
- Exportación Android e iOS de ambas aplicaciones: cuatro bundles completados.
  Son exports locales, no APK instalados ni releases publicados.
- Navegador con fixtures: modo por defecto sin precio, selección de ruta y una
  confirmación legacy que produce exactamente un INSERT interceptado; ninguna
  llamada a cotizaciones ni escritura real.
- No quedó verificado en navegador el modo de cotización obligatoria ni Payment:
  un reinicio del entorno y luego un timeout al transformar el bundle de prueba
  impidieron alcanzar ese modo. No se interpreta como un pase. Los RPC, HTTP y
  contratos de ambos puntos de entrada sí tienen comprobaciones locales; falta
  completar el recorrido de interfaz requerido y Android físico.

### Reintento posterior al preparar administración

Se reintentó el modo obligatorio mediante export web temporal y backend de
fixtures aislado en loopback, sin cambiar flags reales. El navegador de pruebas
se reinició antes de crear el contexto/navegar: no hubo solicitudes ni escrituras.
Siguen **sin aprobarse en navegador** la confirmación única obligatoria,
expiración/error y confirm-ride/book-ride/Payment. Ver
`phase-5-admin-console.md` para el procedimiento y sus límites.

Se corrigió únicamente el borrador de elegibilidad vehicular: el enum histórico
es `active`, no `approved`. La prueba SQL ahora usa el enum real en vez de texto;
no se aplicó la corrección a ningún backend remoto.
