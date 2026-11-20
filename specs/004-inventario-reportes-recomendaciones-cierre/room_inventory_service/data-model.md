# Modelo de datos — Room Inventory Service

Inventory posee estas tablas en `inventory_db`; Accommodations conserva la autoridad sobre propiedades y habitaciones.

## `room_inventories`

Agregado por habitación. No se crea para una habitación válida sin items hasta la primera escritura; por eso la lectura sintética vacía usa `version=0`.

| Campo | Tipo | Restricción |
|---|---|---|
| `room_id` | UUID | PK; referencia externa opaca, sin FK remota |
| `property_id` | UUID | requerido; snapshot mínimo de contexto |
| `owner_id` | UUID | requerido; snapshot mínimo, revalidado al escribir/consultar |
| `version` | INTEGER | `>= 1` para fila persistida |
| `created_at` | TIMESTAMPTZ | requerido, default `now()` |
| `updated_at` | TIMESTAMPTZ | requerido, actualizado por escritura |

Índice: `(owner_id, updated_at)`. La actualización usa `WHERE room_id=? AND version=?`.

## `inventory_items`

| Campo | Tipo | Restricción |
|---|---|---|
| `id` | UUID | PK |
| `room_id` | UUID | FK local a `room_inventories`, cascade solo si se elimina el agregado administrativamente fuera del MVP |
| `type` | ENUM | `PRODUCT|SERVICE` |
| `name` | VARCHAR(120) | trim, 1..120 caracteres |
| `quantity_available` | INTEGER | `0..1 000 000` |
| `active` | BOOLEAN | requerido, default true |
| `created_at` | TIMESTAMPTZ | requerido |
| `updated_at` | TIMESTAMPTZ | requerido |

Índices: `(room_id, active)` y `(room_id, type)`. No se impone unicidad por nombre porque la fuente no define SKU ni equivalencia de productos.

## Invariantes del agregado

- Máximo 200 items por habitación, activos e inactivos incluidos.
- Todos los items de un PUT pertenecen al `roomId` de la URL.
- POST crea un UUID nuevo y aumenta la versión exactamente uno.
- PUT valida toda la colección antes de persistir.
- ID existente puede cambiar nombre, tipo, cantidad o activo.
- ID desconocido en PUT se rechaza; nuevos items se agregan mediante POST.
- Item persistido omitido en PUT queda `active=false`; no se elimina físicamente.
- Estado normalizado idéntico no incrementa versión.
- `expectedVersion` distinto produce 409, salvo replay cuyo estado deseado ya coincide con el actual.

## Transiciones

```text
Habitación válida sin fila: version 0, []
POST primer item:          version 1, [item activo/inactivo]
POST/PUT con cambio:       version N -> N+1
PUT sin cambio/replay:     version N -> N
PUT conflictivo:           sin mutación, 409
Omisión en PUT:            item.active true|false -> false
```

## Sincronización de contexto

Cada operación consulta Accommodations. Al escribir, `property_id` y `owner_id` se actualizan al contexto autoritativo dentro de la misma transacción. No se guardan nombres, dirección, precio, fotos, capacidad ni estado completo de la propiedad.

## Retención y privacidad

No se almacenan datos de huésped, usuario, pagos o reservas. La eliminación física/retención histórica requiere una política futura y no forma parte de este Sprint.
