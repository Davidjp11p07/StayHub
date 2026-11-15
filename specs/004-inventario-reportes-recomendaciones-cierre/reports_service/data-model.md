# Modelo de datos — Reports Service

Reports posee estas tablas en su PostgreSQL. Son proyecciones de lectura, no nuevas fuentes de verdad del negocio.

## `report_booking_facts`

Una fila por reserva observada.

| Campo | Tipo | Restricción/uso |
|---|---|---|
| `booking_id` | UUID | PK |
| `owner_id`, `property_id`, `room_id` | UUID | requeridos; filtros y trazabilidad; no se persiste `guest_id` |
| `check_in`, `check_out` | DATE | `check_out > check_in` |
| `planned_total_minor` | BIGINT | >= 0; informativo, no ingreso reconocido |
| `currency` | CHAR(3) | ISO 4217 en mayúsculas |
| `status` | ENUM/text | CREATED, CONFIRMED, CANCELLED, COMPLETED |
| `created_at`, `confirmed_at`, `cancelled_at`, `completed_at` | TIMESTAMPTZ | hitos conocidos |
| `cancelled_by` | TEXT nullable | actor `GUEST|OWNER|ADMIN|SYSTEM` reportado por evento |
| `projection_updated_at` | TIMESTAMPTZ | auditoría |

Índices: `(owner_id, check_in, check_out)`, `(room_id, check_in, check_out)`, `(owner_id, status, created_at)`.

Transiciones aceptadas: CREATED → CONFIRMED/CANCELLED; CONFIRMED → COMPLETED/CANCELLED. Un evento atrasado no revierte un estado terminal; se registra como diferido o ignorado de forma auditable.

## `report_payment_facts`

Una fila por pago aprobado; los reembolsos acumulados actualizan la misma proyección.

| Campo | Tipo | Restricción/uso |
|---|---|---|
| `payment_id` | UUID | PK |
| `booking_id` | UUID | requerido e indexado; no se persiste `payer_user_id` |
| `approved_amount_minor` | BIGINT | > 0 |
| `refunded_amount_minor` | BIGINT | 0..approved_amount_minor |
| `currency` | CHAR(3) | requerida |
| `approved_at`, `last_refund_at` | TIMESTAMPTZ | fecha financiera |
| `projection_updated_at` | TIMESTAMPTZ | auditoría |

Índice: `(booking_id, currency, approved_at)`. Ingreso neto = `approved_amount_minor - refunded_amount_minor`, siempre agrupado por moneda.

## `report_room_activity_periods`

Historial temporal de habitaciones que forman el denominador de ocupación.

| Campo | Tipo | Restricción/uso |
|---|---|---|
| `id` | UUID | PK |
| `room_id`, `owner_id`, `property_id` | UUID | requeridos |
| `effective_from` | TIMESTAMPTZ | inclusivo |
| `effective_to` | TIMESTAMPTZ nullable | exclusivo; null = vigente |
| `active` | BOOLEAN | estado durante el intervalo |
| `projection_version` | BIGINT | monotónico por habitación |
| `projection_updated_at` | TIMESTAMPTZ | auditoría |

Restricciones: `effective_to > effective_from`; no se admiten intervalos superpuestos para una habitación; `(room_id, projection_version)` único. Índice `(owner_id, effective_from, effective_to)`.

## `processed_report_events`

Inbox idempotente.

| Campo | Tipo | Restricción/uso |
|---|---|---|
| `event_id` | UUID | PK |
| `event_type`, `schema_version` | TEXT/INTEGER | requeridos |
| `payload_hash` | CHAR(64) | detecta reutilización corrupta del ID |
| `occurred_at`, `processed_at` | TIMESTAMPTZ | requeridos |
| `outcome` | ENUM/text | APPLIED, IGNORED, DEFERRED |
| `error_code` | TEXT nullable | diagnóstico estable |

El evento y la mutación de la proyección se confirman en una única transacción.

## `deferred_report_events`

Eventos válidos que aún no pueden aplicarse, por ejemplo un pago recibido antes de su reserva.

| Campo | Tipo | Restricción/uso |
|---|---|---|
| `event_id` | UUID | PK/FK lógico al inbox |
| `event_type` | TEXT | requerido |
| `normalized_payload` | JSONB | validado antes de guardar |
| `attempts` | INTEGER | >= 0 |
| `next_attempt_at` | TIMESTAMPTZ | índice de reproceso |
| `last_error_code` | TEXT | requerido |
| `created_at`, `updated_at` | TIMESTAMPTZ | auditoría |

## `report_projection_state`

Fila singleton para observabilidad: `data_as_of`, último evento por fuente, profundidad diferida, última sincronización correcta y estado de cobertura de habitaciones.

## Fórmulas de lectura

- Periodo: `[from, to)` en UTC; máximo 366 días.
- Noches ocupadas: suma de intersecciones nocturnas de reservas CONFIRMED/COMPLETED con el periodo, sin doble contar una misma habitación/noche.
- Noches disponibles: habitación activa por cada noche del periodo.
- Ocupación: `occupied_nights / available_nights * 100`; `null` si el denominador es 0.
- Ingreso neto: aprobados menos reembolsados, agrupado por moneda.
- Cancelación: reservas canceladas / (reservas confirmadas + canceladas) en el periodo; `null` si el denominador es cero.

## Retención y privacidad

La proyección guarda identificadores mínimos; no replica nombres, correos, teléfonos ni datos de tarjeta. La retención y eliminación deberán alinearse con la política global antes de producción.
