---
name: Commercial quote approval
description: Example rates and supported algorithms are not business authorization to quote or charge.
---

La regla de ejemplo no está autorizada comercialmente. No usar sus cifras para
importes cobrables, no presentarlas como precios oficiales ni aprobarlas por
renombrarlas o copiarlas automáticamente.

**Why:** El usuario lo indicó expresamente al definir la fase de cotizaciones.

**How to apply:** Exigir aprobación comercial explícita, con actor real y
versión auditable. Sin ella, cotización no disponible, sin inventar importes.
La compatibilidad legacy sin precio no autoriza cobros.

Que un algoritmo admita mínimo sobre el total o una tarifa sin recargo nocturno
no significa que el negocio haya elegido esas políticas. Recargo nocturno,
orden del mínimo, cancelación, espera y comisiones requieren decisiones del
negocio; no completar esos vacíos con valores supuestos.

**Why:** El usuario pidió dejarlos sin valores inventados y separar cotización
de cargos, pagos y retiros.

**How to apply:** Diferenciar capacidad técnica de aprobación comercial antes
de habilitar reglas, interfaces o migraciones. No crear administradores ficticios
en la aplicación para saltarse la aprobación; fixtures sintéticos solo locales.
