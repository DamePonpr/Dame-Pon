---
name: OpenAPI codegen compatibility
description: Orval auto-detection and operation/schema names can generate incompatible Zod output.
---

El major de Zod usado por el generador debe coincidir con el paquete consumidor,
no con lo que detecte automáticamente en el workspace del generador.

**Why:** Orval puede emitir API de Zod 4 cuando su propio workspace no declara
Zod, aunque el consumidor use Zod 3. Las comprobaciones del consumidor fallan
con métodos inexistentes; no implica que deba actualizarse toda la aplicación.

**How to apply:** Mantener explícito el major compatible al regenerar contratos.
Usar nombres distintos para modelos de entrada y los tipos inferidos de las
operaciones: los barrels exportan ambos y una colisión causa export ambiguo.
