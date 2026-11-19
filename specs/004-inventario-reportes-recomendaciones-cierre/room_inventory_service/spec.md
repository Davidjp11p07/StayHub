# Feature Specification: Room Inventory Service de StayHub

**Feature context**: `room_inventory_service`  
**Fecha**: 2026-11-15  
**Fuente de verdad**: `tendencias.md`, objetivo general, catálogo de microservicios, Sprint 4 y requisitos no funcionales  
**Alcance**: backend de `room-inventory-service`; sin frontend, Reports, Messaging ni Recommendations

## Objetivo

Permitir que un propietario administre y consulte los productos y servicios disponibles en sus habitaciones. El servicio conserva su propia base de datos, identifica las habitaciones mediante IDs opacos de Accommodations y no gestiona reservas, disponibilidad por fechas, precios base, características del alojamiento ni habitaciones físicas.

## Trazabilidad con `tendencias.md`

| Fuente | Cobertura |
|---|---|
| Objetivo general | “Inventario de habitaciones y servicios del alojamiento”. |
| Catálogo de microservicios | `room-inventory-service`: control de productos y servicios disponibles en cada habitación o alojamiento. |
| Endpoints definidos | `GET /inventory/rooms/:id`, `PUT /inventory/rooms/:id`, `POST /inventory/rooms/:id/items`. |
| Sprint 4 | Entregable `room-inventory-service` NestJS; estimación original de 10 horas. |
| Criterio de aceptación | “El inventario de habitaciones se actualiza correctamente”. |
| RNF | p95 < 500 ms para consultas, JWT/roles, OpenAPI, logs, PostgreSQL propio y Docker Compose. |

`tendencias.md` no asigna un número RQ específico al inventario: RQ-12 pertenece a Reports y RQ-13 a Recommendations. Por tanto, esta feature se traza al entregable y criterio de aceptación explícitos del Sprint 4, sin adjudicarse un RQ ajeno.

## Interpretación mínima del alcance

- El MVP cubre inventario **por habitación**, porque los tres endpoints documentados usan `/inventory/rooms/:id` y la tarea del Sprint se denomina “Inventario de habitaciones”.
- Cada elemento es un `PRODUCT` o `SERVICE`, con nombre, cantidad disponible y estado activo.
- `PUT` reemplaza de manera idempotente la fotografía completa del inventario de una habitación usando versión optimista; `POST .../items` agrega un elemento.
- Un servicio puede usar `quantityAvailable` como cupos disponibles. No se implementan agendas, franjas horarias ni reservas del servicio.
- Inventario común a toda una propiedad requeriría un endpoint/contrato adicional no definido en la fuente y queda fuera de este incremento.

## Historias de usuario

### US1 — Consultar inventario de una habitación (P1)

Como propietario, quiero consultar los productos y servicios disponibles en una habitación propia para conocer su inventario actual.

**Criterios de aceptación**:

1. OWNER solo consulta habitaciones de propiedades que le pertenecen; ADMIN puede consultar cualquier habitación.
2. Una habitación válida sin inventario devuelve una colección vacía y `version=0`, no un error ficticio.
3. Una habitación inexistente o no visible devuelve 404 sin filtrar información de otro propietario.
4. La respuesta contiene `roomId`, `propertyId`, versión, fechas e items; no replica datos personales ni detalles completos del alojamiento.

### US2 — Agregar un producto o servicio (P1)

Como propietario, quiero agregar un producto o servicio al inventario de una habitación propia para ofrecerlo o controlarlo.

**Criterios de aceptación**:

1. `type` solo acepta `PRODUCT|SERVICE`, `name` no puede estar vacío, `quantityAvailable` es entero entre 0 y 1 000 000 y `active` es booleano.
2. El elemento recibe UUID, queda asociado a una habitación validada por Accommodations e incrementa la versión del inventario.
3. OWNER ajeno y GUEST reciben 403; habitación inexistente/oculta recibe 404.
4. La creación y la actualización de versión se confirman en una sola transacción PostgreSQL.

### US3 — Actualizar el inventario completo (P1)

Como propietario, quiero reemplazar de forma controlada el inventario de una habitación para corregir cantidades, nombres y disponibilidad sin perder consistencia.

**Criterios de aceptación**:

1. `PUT` recibe `expectedVersion` y la colección completa de items; la operación es idempotente para el mismo cuerpo y versión resultante.
2. Una versión desactualizada devuelve 409 y no modifica ningún item.
3. Los IDs existentes se preservan; los IDs desconocidos se rechazan. La omisión de un item existente lo desactiva en lugar de borrar el historial físico.
4. La colección completa se valida antes de iniciar la transacción y la versión solo se incrementa si cambia el estado persistido.

### US4 — Operación segura y portable (P2)

Como operador, quiero ejecutar y observar Inventory de manera independiente para detectar fallos de configuración, base de datos o dependencia Accommodations.

**Criterios de aceptación**:

1. Liveness distingue proceso vivo; readiness exige configuración, migraciones y PostgreSQL, y reporta la dependencia Accommodations de forma segura.
2. Logs y trazas incluyen `traceId`, ruta, rol, roomId y duración, sin JWT ni cuerpos completos.
3. Docker Compose levanta base, migración y servicio; el contenedor es no-root y termina ordenadamente.
4. Contratos, seguridad, persistencia, concurrencia y flujo Gateway → Inventory tienen pruebas automatizadas; cobertura >= 70 %.

## Requisitos funcionales derivados

- **INV-FR-001**: exponer `GET /inventory/rooms/{roomId}`.
- **INV-FR-002**: exponer `POST /inventory/rooms/{roomId}/items`.
- **INV-FR-003**: exponer `PUT /inventory/rooms/{roomId}` como reemplazo versionado del agregado.
- **INV-FR-004**: autorizar OWNER propio y ADMIN; rechazar GUEST y tokens inválidos.
- **INV-FR-005**: verificar habitación, propiedad y propietario mediante contrato REST interno con Accommodations; nunca leer su base.
- **INV-FR-006**: persistir inventarios exclusivamente en `inventory_db` PostgreSQL con Prisma, transacciones y control optimista.
- **INV-FR-007**: validar DTOs con allowlist cerrada, UUIDs, límites de longitud/cantidad y máximo de items por habitación.
- **INV-FR-008**: documentar las tres APIs en OpenAPI y exponerlas a través del API Gateway.

## Fuera de alcance

- Disponibilidad de habitaciones por fechas, bloqueos o solapamientos de reserva.
- CRUD de propiedades/habitaciones, fotos, características y precio base.
- Cobros, cargos de minibar, consumo del huésped, órdenes, pagos o reembolsos.
- Reservas de servicios, calendarios, proveedores, compras, reposición automática o alertas de stock.
- Inventario global por propiedad y endpoints no presentes en `tendencias.md`.
- RabbitMQ, Redis, frontend y los demás microservicios del Sprint 4.

## Dependencias y límites

- Accommodations es autoridad sobre `roomId`, `propertyId` y `ownerId`. El repositorio no ofrece hoy una consulta interna por `roomId`; se requiere el contrato mínimo `GET /internal/v1/rooms/{roomId}/inventory-context` con service JWT. Su configuración actual protege Booking Quote con un único scope, por lo que debe ampliarse por endpoint sin relajar ni romper `accommodations:booking-quote`.
- API Gateway debe enrutar las tres APIs y delegar `sub`/`role` mediante JWT interno de corta vida.
- Si el contrato real de Accommodations no se implementa, Inventory puede validarse con stub/fixtures, pero no se declara integrada la autorización por propiedad.

## Definition of Done

- Tres endpoints conformes a OpenAPI y al comportamiento descrito.
- Migración desde PostgreSQL 16 vacío y transacciones verificadas.
- Autorización OWNER/ADMIN y contrato Accommodations validados con integración real.
- Reemplazo concurrente prueba 409 sin actualizaciones parciales.
- p95 < 500 ms para lectura en dataset acordado, cobertura >= 70 % y gates lint/typecheck/build verdes.
- Gateway y Docker Compose ejecutados con evidencia; imagen no-root, health checks y shutdown verificados.
- Revisión humana confirma trazabilidad al entregable/criterio del Sprint 4 y ausencia de funciones fuera de alcance.
