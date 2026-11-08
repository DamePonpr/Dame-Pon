# Evidencia de interfaz — Fases 4 y 5

**Ejecución local:** 8 de noviembre de 2026. No se aplicaron migraciones ni se
hicieron llamadas al Supabase remoto, pagos, Storage real, GitHub, staging o
producción. No se publicaron cambios.

## Entorno y límites de la prueba

`scripts/ui-verification/` crea exports web de prueba y servidores limitados a
`127.0.0.1`. El navegador solo deja pasar loopback. Auth, REST/RPC, Realtime,
OSRM, cotizaciones y panel admin contestan desde datos sintéticos en memoria;
los JWT del fixture tienen firma intencionalmente inválida. La respuesta de
cotización de **USD 9.87** y cualquier aprobación son exclusivamente ficticias.
No son una tarifa autorizada, un resultado real del backend o un cobro.

El builder verifica que la copia web obligatoria contenga la rama activada y la
copia legacy la desactivada. Expo/Metro no propagó de manera fiable el valor
solicitado durante estas exportaciones; por eso solo se normaliza la constante
en los bundles desechables y se vuelve a comprobar. Nunca se editan el código
de producción, `.env.production` ni las compuertas reales con ese ajuste.

## Pasajero — Chromium con Playwright

Runner repetible: `pnpm --filter @workspace/scripts run test:ui:passenger`.
Resultado: **7 escenarios aprobados**. Capturas y respuestas completas en
`generated-artifacts/ui-evidence/`.

Para repetir, ejecutar primero `pnpm --filter @workspace/scripts run test:ui:prepare`,
iniciar dos copias con `node scripts/ui-verification/server.mjs
generated-artifacts/ui-builds/required 18749 mobile` y
`node scripts/ui-verification/server.mjs generated-artifacts/ui-builds/legacy
18750 mobile`, y luego correr el runner. Para administración, iniciar la tercera
copia en `18751` con `artifacts/dame-pon-admin/dist/public admin`; el navegador
solo conecta a esos puertos loopback. Los contratos pequeños se repiten con
`pnpm --filter @workspace/scripts run test:ui:fixtures`.

| Escenario | Resultado observado |
|---|---|
| Ruta/cotización obligatoria | Origen y destino de fixture; 2.4 km, 5 min; desglose ficticio USD 9.87. |
| Error al cotizar | Confirmar queda bloqueado; el reintento obtiene cotización y se habilita. |
| Expiración | Con TTL de prueba de 2 s, se bloquea; una cotización nueva recupera el flujo. |
| API devuelve `quote_expired` | No crea viaje; se invalida la cotización, se bloquea la confirmación y una nueva cotización recupera el botón. |
| Doble toque y finalización | Una solicitud de confirmación y un viaje; el historial refleja el total ficticio y estado pendiente de pago, sin cobro. |
| Respuesta perdida y concurrencia | Reintentos concurrentes ficticios comparten un ID; queda un único viaje de prueba. No prueba atomicidad SQL real. |
| Flujo legacy | Con la compuerta de la copia apagada se crea por `POST /rest/v1/trips`, sin `POST /api/quotes/confirm`. El proveedor de cotización puede seguir mostrando una cotización no comercial; esta no confirma ni fija precio en legacy. |
| find-ride → confirm-ride → book-ride/Payment | Se llega a “Solicitud enviada”; el registro es ficticio, pendiente y no hay solicitudes de pago/cargo. |

La recuperación de la cotización ante el rechazo de servidor dejó de presentar
una cotización vencida como vigente. La separación `status=completed` en historial
y `status IN (...)` para viajes activos se comprobó también contra el fixture
PostgREST. El control de finalización no invocó un conductor o Supabase real.

## Administración — Chromium con Playwright

Runner repetible: `pnpm --filter @workspace/scripts run test:ui:admin`.
Resultado: **10 escenarios aprobados**. Capturas y detalle en
`generated-artifacts/ui-evidence/admin/`.

- Acceso con identidad admin sintética concedido y con identidad no-admin
  denegado por el API simulado.
- Conductor: aprobar, rechazar y suspender con motivo. Vehículo: activar,
  sacar de servicio y retirar. Las respuestas de prueba incluyen auditoría.
- Conflicto por revisión obsoleta rechazado, sin evento de auditoría nuevo.
- Enlace documental HTTPS sintético temporal: expiración visible y retirada del
  enlace, fallo sin URL y recuperación con una nueva URL ficticia. La UI ahora
  indica expresamente cuando vence el enlace.
- Incidentes y soporte: asignación, transiciones e historial simulados.
- Viajes y tarifas/cotizaciones muestran cero controles de escritura.
- A 390×844, el panel no tuvo overflow horizontal y las secciones de conductores
  y viajes permanecieron separadas.

El build del panel inicialmente falló en navegador con `No QueryClient set`. Se
corrigió el dedupe de `@tanstack/react-query` entre el panel y el cliente
generado; el build y el inicio de sesión simulado ahora pasan. Esto no prueba
que una acción se autorice contra el JWT, una RPC o RLS reales.

## Verificaciones ejecutadas

- Suite completa y serial de pruebas locales: **170 aprobadas, 0 fallos**.
- Typecheck de los paquetes admin, pasajero, conductor, API y scripts: aprobado.
- Exports web temporales de pasajero (modo requerido y legacy) y build web
  admin: completados. El build web reporta warnings de sourcemap en componentes
  existentes y un chunk de más de 500 KB; no impidieron compilar.
- API local: `/api/admin/config` devuelve `enabled:false` fuera del harness.
  La pantalla/proceso real sigue inactivo; solo el servidor aislado habilita
  un admin ficticio para estas pruebas.

## Pendiente

No se han verificado Auth/JWT reales, RLS, la autorización de RPC y REST,
permisos y URLs firmadas de Storage real, operaciones sobre datos reales,
conflictos SQL concurrentes, ninguna migración, staging autorizado ni Android
físico. No se han aprobado tarifas comerciales ni nocturnidad, mínimos,
cancelaciones, espera o comisiones. Antes de habilitar cualquiera de las fases,
realizar ensayo aislado autorizado y revisión del dispositivo; mantener
compuertas apagadas mientras falten estos pasos.
