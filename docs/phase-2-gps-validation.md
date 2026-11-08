# Fase 2: GPS y presencia en primer plano

## Estado de activación

La migración `supabase/migrations/20261108020000_driver_foreground_presence.sql`
está preparada, **no aplicada**, por decisión del usuario. No se ha publicado
una app ni una función edge. El código nuevo depende de esas funciones RPC:
no debe presentarse como operativo en el Supabase actual antes de su activación.
La aplicación muestra un error explícito si falta la función GPS.

La migración es aditiva: añade una fecha de ubicación sin rellenar coordenadas
ni modificar roles, documentos, tarifas o pagos. Conserva RLS y ajusta la lectura
al conductor asignado en un viaje `accepted`, `arrived` o `in_progress`.
La publicación deriva la identidad de `auth.uid()` y exige un conductor aprobado.
El pasajero no proporciona una identidad de conductor para publicar ubicación.

**Activación coordinada:** las lecturas de solicitudes y las aceptaciones
exigirán una ubicación confirmada en los últimos 45 segundos. Las versiones
anteriores sin este envío GPS dejarán de poder aceptar viajes. No aplicar esa
restricción de forma independiente de la actualización de clientes sin
autorización explícita. Validar primero en un entorno de ensayo autorizado.

## Comportamiento

- Disponible solicita permiso de primer plano y una lectura GPS real.
- Rechaza lecturas fuera de rango, de más de 20 segundos, futuras o con precisión
  peor de 100 metros; no sustituye el GPS por coordenadas de ejemplo.
- Watcher de alta precisión; mínimo 10 segundos entre publicaciones normales.
  Publica por movimiento de al menos 15 metros o heartbeat de 25 segundos.
  Un control periódico renueva la lectura incluso con el vehículo estacionado.
- No disponible cancela el watcher y las tareas pendientes. La baja remota
  se ordena después de escrituras que ya estaban en curso.
- Cerrar sesión espera esa limpieza antes de retirar las credenciales.
- Al minimizar se detiene el seguimiento y queda No disponible. Al volver se
  requiere volver a activar el interruptor. No hay tarea real de segundo plano
  en el proyecto: se retiró su declaración de permisos, no se simula soporte.
- Una pérdida de red no acumula puntos; hay reintentos acotados. Si no puede
  confirmarse la baja, se informa. Con la migración activa, la frescura expira
  aunque el proceso muera y el bit histórico `is_online` siga en true.
- El pasajero consulta solo el ID de su viaje activo, con verificación en el
  servidor. Los resultados pendientes de otra identidad/viaje/conductor se
  descartan. Se oculta el marcador cuando está desconectado, offline o vencido.
- Realtime acelera las actualizaciones; hay reconciliación REST cada 10 segundos.
  La hora y el estado se recalculan aunque no llegue ningún evento.

## Verificación automatizada

```sh
pnpm --filter @workspace/dame-pon-conductor run test:driver-tracking
node --experimental-strip-types --test packages/shared/tests/*.test.mjs artifacts/dame-pon-pasajero/scripts/*.test.mjs artifacts/dame-pon-conductor/scripts/*.test.mjs
pnpm run typecheck
```

Las pruebas unitarias ejecutan el controlador con adaptadores controlados:
permisos, GPS apagado, precisión, cancelación durante operaciones pendientes,
límites de escritura, reconexión, caducidad y ámbito del pasajero.
Las comprobaciones de SQL son estáticas: **no sustituyen una ejecución de
migración ni pruebas RLS con sesiones reales**. Las pruebas de navegador
interceptan Supabase y usan geolocalización de ensayo del navegador, nunca
escriben esas coordenadas en la base real.
El mapa web existente es una referencia, no el mapa nativo MapLibre:
la representación y el movimiento de sus marcadores requieren prueba móvil.

No ejecutar los verificadores de viajes existentes contra producción para
probar esta fase: escriben datos y ahora necesitan preparar presencia GPS
en un entorno de pruebas separado.

## Android físico: todavía necesario

Con una compilación nueva compatible, backend de ensayo autorizado y dos
sesiones de ensayo aisladas:

1. Permitir/rechazar ubicación, denegar permanentemente y volver desde Ajustes.
2. Probar ubicación aproximada frente a precisa, interiores y GPS desactivado.
3. Activar Disponible, caminar/conducir y comprobar movimiento, tiempos,
   heartbeat estacionario y frecuencia efectiva de escrituras.
4. Cortar internet y recuperarlo; no aceptar con una ubicación vencida.
5. Desactivar Disponible o cerrar sesión mientras hay una petición pendiente:
   no deben publicarse nuevos puntos y el observador debe quedar detenido.
6. Minimizar, bloquear pantalla, matar el proceso y abrir de nuevo: no afirmar
   disponibilidad persistente ni segundo plano. El pasajero debe ver caducidad
   si no pudo enviarse la baja.
7. Confirmar con dos pasajeros que solo el dueño del viaje asignado puede leer
   el conductor y que ninguno puede escribir sus coordenadas. Finalizar/cancelar
   el viaje debe retirar el acceso y el marcador.

## Límite de las notificaciones existentes

La función edge `trip-push` publicada mantiene su filtro histórico
`is_online/status`; no se desplegó una versión con el filtro de frescura.
La migración preparada protege lectura y aceptación, pero podría llegar un
aviso push antiguo a un conductor desconectado. Alinear ese filtro con la
presencia antes de activar un despacho completo; no desplegarlo sin autorización.
