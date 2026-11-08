# Fase 3: mapas y rutas por carretera (preparación local)

## Alcance y proveedores inspeccionados

- MapLibre React Native **11.3.10**, ya instalado en las dos apps, con estilos
  OpenFreeMap bright/dark y atribución. No se añade Google Maps ni una llave.
- Photon `photon.komoot.io`, ya integrado bajo el nombre histórico
  `GoogleTextInput`. No es Google Places.
- No existía un servicio de ruta. Se incorpora OSRM sobre el servidor público
  de FOSSGIS `https://routing.openstreetmap.de/routed-car/route/v1/driving`.
- La versión web de LiveRideMap sigue siendo una referencia textual, NO un mapa
  interactivo. La línea/cámara/marcadores reales corresponden al componente
  nativo. No confundir una prueba del navegador con una prueba Android.

**No se modificó ni consultó Supabase remoto en esta fase. No se ejecutaron sus
migraciones, no se publicó ni cambió el despliegue, y no se tocaron pagos/tarifas.**
Las migraciones y el protocolo GPS de fase 2 permanecen sin cambios.

## Flujo implementado

1. El pasajero elige origen GPS preciso/reciente en PR o una sugerencia manual.
   Denegar permiso, GPS apagado o demora no impiden elegir un origen manual.
   Se conserva el geocodificador inverso existente de Expo/OS como etiqueta
   opcional; si falla no se reemplazan las coordenadas por un ejemplo.
2. Selecciona una sugerencia de destino. Escribir texto no confirma una ubicación.
   Se muestran dirección completa y punto para distinguir candidatos; se filtran
   centroides genéricos de ciudad/municipio y puntos fuera de los límites de PR.
   Incluye números/calle, ciudad y código postal cuando Photon los devuelve.
3. OSRM calcula una ruta de automóvil y devuelve metros, segundos y GeoJSON.
   Se muestran km/minutos y una línea nativa, con encuadre que incluye TODA la
   geometría y ambos extremos. No se estima una carretera con distancia recta.
   El encuadre del conductor deja espacio proporcional al panel inicial del
   45 % de la pantalla, incluyendo al rotar el dispositivo.
4. Solo **Confirmar y solicitar Pon** solicita el viaje. Se comprueba que la ruta
   coincide con origen/destino actuales y tiene menos de cinco minutos.
   Editar texto invalida la selección y cancela la consulta anterior.
5. El POST existente conserva únicamente los campos de solicitud ya permitidos:
   direcciones/coordenadas de pickup y dropoff, pasajero y PIN según el código
   existente. NO se escribe distancia, precio, ETA ni geometría en Supabase.
6. El conductor calcula el mismo trayecto origen–destino desde los extremos de
   SU viaje autorizado. No usa coordenadas de otros conductores ni su propio GPS
   como origen implícito. No se amplía SELECT privado ni se toca RLS.

No hace falta migración de fase 3. Los extremos ya existen en trips y en las
lecturas autorizadas. La ruta se **recalcula**, no se promete una instantánea
idéntica guardada entre dispositivos: el grafo/proveedor puede cambiar.
Un viaje antiguo sin coordenadas válidas no se geocodifica silenciosamente
desde una dirección ambigua; se informa que no se puede calcular su ruta.

## Semántica y errores

- ETA es la duración estimada TOTAL origen–destino, no la llegada del conductor.
  No incluye tráfico en vivo ni es una promesa de puntualidad o una cotización.
- No hay navegación guiada, instrucciones vocales, recálculo por desvío ni
  seguimiento en segundo plano. Pedir steps a OSRM solo permite rechazar ferry;
  no implementa navegación. No se ofrece una ruta con ferry como carretera.
- Estados: selección incompleta, cargando, origen/destino inválidos, mismo punto,
  sin ruta/segmento conectado, conexión al servicio fallida, respuesta lenta,
  proveedor indisponible/saturado, ferry y estimación vencida.
- Fetch que falla por red se muestra como fallo de conexión AL SERVICIO; no se
  asegura que el teléfono esté offline en vez de existir un problema de DNS/red.
- OSRM radiuses=250 m; también se comprueban distancias de snapping y extremos
  de la geometría. Se rechaza geometría malformada, ajena a PR, modos desconocidos
  y métricas no finitas. No hay fallback de kilómetros o minutos inventados.
- Si fallan las teselas, el mapa informa el problema sin cambiar el viaje.
  Una ruta en caché no prueba que el mapa de calles esté disponible.

## Caché, red y privacidad

`roadRouting.ts`: caché RAM de 24 rutas, TTL cinco minutos, copias defensivas.
`addressSearch.ts`: 32 consultas normalizadas en RAM, TTL cinco minutos.
No se guarda historial de rutas ni se persiste localización en disco.

Cada proveedor tiene una cola local con al menos 1,1 s entre inicios de
solicitud. Búsqueda con debounce de 800 ms. Deadline de ocho segundos incluso
si el adaptador ignora abort; AbortController y guardas de generación/ámbito.
Solo un reintento para fallos transitorios de conexión/502/503/504. No se
reintentan 429, rutas inexistentes, payloads inválidos ni cancelaciones.
La ruta no se consulta en cada heartbeat GPS. No hay consultas de fondo.

Photon recibe los términos escritos; OSRM recibe las coordenadas SELECCIONADAS
de origen/destino. El formulario lo avisa. No se envían JWT, IDs de cuenta,
PIN, teléfonos, llave Supabase ni GPS privado del conductor.
Los operadores externos pueden registrar consultas: no es procesamiento
puramente en el dispositivo.

## Condiciones del servicio público y activación futura

OSRM/FOSSGIS y Photon no cobran una llave al proyecto ni añaden facturación,
pero son servicios comunitarios sin SLA. FOSSGIS exige atribución, enlace a
corregir mapa, User-Agent/referrer válido, máximo una solicitud por segundo
y ausencia de uso masivo/scraping. Se muestran atribuciones y enlaces; nativo
identifica Dame Pon en User-Agent y web conserva el UA/referrer del navegador.

La cola por instalación NO coordina la carga de una flota. **No lanzar uso
masivo contra el servidor público.** Antes de producción, acordar capacidad o
alojar OSRM abierto con cobertura OSM de PR y control agregado; eso requiere una
decisión y despliegue separados. No se añadió un proxy ni una dependencia del
API server actual, y no se cambió su publicación.

Documentación consultada:
- https://project-osrm.org/docs/v5.24.0/api/
- https://routing.openstreetmap.de/about.html

## Verificaciones reproducibles

```sh
node --experimental-strip-types --test packages/shared/tests/road-routing.test.mjs
node --experimental-strip-types --test packages/shared/tests/*.test.mjs artifacts/dame-pon-pasajero/scripts/*.test.mjs artifacts/dame-pon-conductor/scripts/*.test.mjs
pnpm run typecheck
# Exports locales, NO APK ni publicación:
CI=1 pnpm --filter @workspace/dame-pon-conductor exec expo export --platform android --platform ios --no-minify --max-workers 2 --output-dir /tmp/dame-pon-phase3-conductor
CI=1 pnpm --filter @workspace/dame-pon-pasajero exec expo export --platform android --platform ios --no-minify --max-workers 2 --output-dir /tmp/dame-pon-phase3-pasajero
```

Los tests de ruta usan respuestas controladas; el conjunto conserva las 110
pruebas anteriores, incluidas las de PostgreSQL local aislado de fase 2.
Resultado local: **128 pruebas aprobadas (110 previas + 18 de rutas), cero
fallos**, typecheck completo y exports Android/iOS de ambas apps.
No ejecutar verify:trip-realtime/verify:rls-hardening contra la base remota:
esos verificadores escriben datos y no forman parte de esta fase.

Se verificó en navegador móvil un flujo sintético origen/destino → edición
invalida selección → NoRoute/reintento → confirmación explícita única → lectura
del mismo trayecto por conductor asignado. Todo Auth/REST/RPC fue interceptado,
Realtime bloqueado y Photon/OSRM simulados antes de navegar: ninguna escritura
real. Se comprobaron los campos existentes del único POST de viaje interceptado.
Funcionó sin GPS preciso utilizable; **no** se demostró específicamente el prompt
de permiso denegado ni renderizado nativo. El host Expo compartido servía la otra
app, por lo que la prueba usó los puertos locales de cada app sin reconfigurar
su publicación.

Se hizo una consulta HTTP real de OSRM y se pasó su respuesta por el parser real,
usando exclusivamente puntos públicos San Juan (18.4655,-66.1057) y Ponce
(18.0111,-66.6141): 117771,8 m, 5866,1 s y 1816 vértices al verificar.
Es evidencia de ese cálculo puntual, NO prueba física, de tráfico ni de SLA.
El proveedor no admite exclude=ferry en este perfil (responde InvalidValue);
por eso se verifican los modos de los segmentos y se rechazan ferries.

## Plan manual Android y comprobaciones pendientes

Requiere APK/development build con MapLibre (no prometer Expo Go), dispositivo
físico y sesiones de ensayo autorizadas. Esta fase no instala APK ni activa DB.

1. Validar dos direcciones concretas en San Juan/Ponce, zonas rurales y puntos
   costeros; confirmar A/B sobre calles, toda la línea, encuadre y atribución
   tanto en pasajero como en conductor. Verificar modo claro/oscuro y rotación.
2. Denegar GPS, denegar permanentemente, GPS apagado, precisión aproximada y
   respuesta lenta; completar selección manual sin inventar origen.
3. Editar rápidamente direcciones con solicitudes en vuelo; elegir sugerencia
   distinta y comprobar que ninguna respuesta vieja habilita la confirmación.
4. Comprobar que antes del botón explícito NO hay solicitud de viaje y que un
   doble toque no la duplica. Solo en backend de ensayo autorizado, confirmar
   que conductor recibe los extremos existentes y no cambia tarifa/pagos.
5. Probar puntos desconectados, agua, Vieques/Culebra/Mona y rutas con ferry:
   deben dar error explícito, nunca una recta etiquetada como carretera.
   La cobertura exacta de esas islas NO se asegura por una prueba San Juan–Ponce.
6. Cortar red durante búsqueda, ruta y teselas; recuperar y reintentar. Revisar
   timeout, saturación, caché antes/después de cinco minutos y batería.
7. Con viaje activo, verificar que se usan extremos guardados, no GPS privado
   como nuevo origen; cambiar cuenta/viaje y comprobar que desaparece la ruta
   anterior. Validar viajes antiguos con coordenadas nulas.
8. Repetir pruebas reales de RLS/JWT/Realtime de fase 2 antes de su activación.
   Este trabajo no cambia su estado pendiente, compuertas, sesiones ni privacidad.
