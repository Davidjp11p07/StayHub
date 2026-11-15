# Feature Specification: Reports Service de StayHub

**Feature context**: `reports_service`  
**Date**: 2026-11-15  
**Source of truth**: `tendencias.md` — RQ-12, Sprint 4, criterios de aceptación y requisitos no funcionales  
**Scope**: backend de `reports-service` y contratos mínimos de integración; sin frontend ni otros microservicios del Sprint 4

## Objetivo

Permitir que un propietario o administrador consulte, por propietario y periodo, métricas agregadas de reservas, ingresos, ocupación, cancelaciones y tendencias. Reports mantiene una proyección analítica propia y eventualmente consistente; nunca consulta ni comparte las bases de datos de Bookings, Payments o Accommodations.

## Trazabilidad

| Fuente | Cobertura de Reports |
|---|---|
| **RQ-12** | Panel estadístico por propietario: reservas, ingresos, ocupación, cancelaciones y tendencias. |
| **Sprint 4** | `reports-service` NestJS, dashboard estadístico y documentación Swagger. |
| **Criterio de aceptación** | El propietario visualiza estadísticas de ocupación e ingresos. |
| **RNF rendimiento** | Las consultas de reportes deben cumplir p95 < 500 ms en el perfil de carga acordado. |
| **RNF seguridad** | JWT, roles OWNER/ADMIN, HTTPS en Gateway, validación y sanitización. |
| **RNF portabilidad** | Servicio, migración, PostgreSQL y dependencias declarados en Docker Compose. |

## Historias de usuario

### US1 — Resumen del propietario (P1)

Como propietario, quiero consultar un resumen de mis reservas, cancelaciones, ocupación e ingresos durante un periodo para conocer el comportamiento de mis alojamientos.

**Criterios de aceptación**:

1. Un OWNER solo puede consultar su propio `ownerId`; un ADMIN puede consultar cualquier propietario.
2. La respuesta separa los importes por moneda y nunca suma COP con USD ni aplica conversión implícita.
3. La respuesta informa el periodo `[from,to)`, la fecha de actualización de la proyección y si existen dependencias degradadas o datos pendientes.
4. El propietario no recibe identificadores de huéspedes, datos de pago ni información de otros propietarios.

### US2 — Ocupación y tendencia (P1)

Como propietario o administrador, quiero consultar la tasa de ocupación y su tendencia para identificar periodos de alta y baja utilización.

**Criterios de aceptación**:

1. `occupiedRoomNights` cuenta noches solapadas con el periodo para reservas confirmadas/completadas y no canceladas.
2. `availableRoomNights` proviene de intervalos de habitaciones activas publicados por el dominio propietario del inventario; una habitación sin reservas también participa en el denominador.
3. `occupancyRate = occupiedRoomNights / availableRoomNights`; cuando el denominador es cero, la tasa es `null`, no cero.
4. La tendencia se agrupa en UTC por día, semana o mes y conserva la semántica `[from,to)`.

### US3 — Ingresos netos (P1)

Como propietario o administrador, quiero consultar ingresos brutos, reembolsos e ingresos netos para evaluar el resultado financiero de mis reservas.

**Criterios de aceptación**:

1. El ingreso bruto se deriva únicamente de `payment.v1.approved` y el reembolso únicamente de `payment.v1.refunded`.
2. Cada evento se aplica una sola vez aunque RabbitMQ lo reentregue.
3. Los totales se presentan por moneda en unidades menores y con código ISO 4217.
4. Un periodo puede mostrar ingreso neto negativo si contiene reembolsos de pagos aprobados en un periodo anterior.

### US4 — Proyección confiable (P2)

Como operador de la plataforma, quiero que Reports procese eventos duplicados, fuera de orden y temporalmente fallidos sin corromper las métricas.

**Criterios de aceptación**:

1. Los eventos se deduplican por `eventId` y hash; reutilizar un ID con contenido distinto se rechaza y audita.
2. Los eventos que llegan antes de su antecedente se conservan como diferidos y se reintentan de forma limitada.
3. El mensaje se confirma en RabbitMQ únicamente después del commit de PostgreSQL.
4. Tras agotar reintentos, el mensaje llega a DLQ y la degradación queda visible en salud, métricas y logs sin exponer el payload completo.

## Requisitos funcionales

- **REP-FR-001**: exponer `GET /reports/owner/{ownerId}` con resumen y tendencia del periodo.
- **REP-FR-002**: exponer `GET /reports/occupancy` con `ownerId`, periodo y granularidad.
- **REP-FR-003**: exponer `GET /reports/revenue` con `ownerId`, periodo y granularidad.
- **REP-FR-004**: aceptar únicamente periodos ISO `YYYY-MM-DD`, `from < to`, máximo 366 días y granularidad `day|week|month`.
- **REP-FR-005**: consumir los eventos v1 existentes de Bookings y Payments necesarios para RQ-12.
- **REP-FR-006**: consumir un contrato versionado de habitaciones activas para el denominador de ocupación.
- **REP-FR-007**: mantener una proyección PostgreSQL propia, idempotente y reconstruible mediante replay controlado.
- **REP-FR-008**: aplicar autorización OWNER propio / ADMIN cualquier propietario en el servicio, aunque Gateway también proteja la ruta.

## Fuera de alcance

- Gráficos o componentes React.
- RQ-13 y `recommendations-service`.
- Inventario de productos/servicios, mensajería o notificaciones.
- Predicciones, machine learning, exportación PDF/Excel o envío programado de reportes.
- Conversión de monedas, contabilidad fiscal, payouts o conciliación financiera.
- Acceso directo a bases de datos ajenas.
- Un dashboard global de toda la plataforma; el alcance es por propietario, como define `tendencias.md`.

## Dependencias y límites de validación

- Bookings ya publica `booking.v1.created|confirmed|cancelled|completed` en `stayhub.bookings.v1`.
- Payments ya publica `payment.v1.approved|refunded` en `stayhub.payments`.
- El repositorio todavía no contiene un evento autoritativo de habitaciones activas. La ocupación completa requiere que Accommodations —actual propietario de propiedades/habitaciones— implemente el contrato `accommodation.v1.room-reporting-upserted`, o que el segundo servicio elegido para Sprint 4 asuma formalmente esa autoridad. Hasta entonces solo se valida el consumidor con fixtures y no se declara RQ-12 completamente integrado.
- API Gateway debe añadir routing y JWT delegado para Reports; Reports no acepta cabeceras de identidad confiadas sin token firmado.

## Métricas definidas

- **reservationsCreated**: cantidad de `booking.v1.created` ocurridos en el periodo.
- **reservationsConfirmed**: cantidad de `booking.v1.confirmed` ocurridos en el periodo.
- **completedStays**: cantidad de `booking.v1.completed` ocurridos en el periodo.
- **cancellations**: cantidad de `booking.v1.cancelled` ocurridos en el periodo, desglosada por `GUEST|OWNER`.
- **cancellationRate**: `cancellations / (reservationsConfirmed + cancellations)` para eventos ocurridos en el periodo; `null` si el denominador es cero.
- **occupancyRate**: noches ocupadas / noches disponibles dentro del periodo solicitado.
- **grossRevenueMinor**: suma de montos aprobados por moneda durante el periodo.
- **refundedMinor**: suma de montos definitivamente reembolsados por moneda durante el periodo.
- **netRevenueMinor**: ingreso bruto menos reembolsos por moneda.

## Definition of Done

- Contratos OpenAPI y de eventos validados automáticamente.
- Migración desde base vacía y proyección idempotente verificadas con PostgreSQL 16 real.
- Eventos duplicados, fuera de orden, retry y DLQ verificados con RabbitMQ real.
- Autorización OWNER/ADMIN, campos extra y periodos inválidos cubiertos por pruebas negativas.
- Cobertura del código afectado >= 70 %, p95 < 500 ms y error < 1 % en el perfil reproducible.
- Imagen no-root, Compose, health checks, logs redactados y cierre ordenado verificados.
- E2E Gateway → Reports con productores reales o, si el contrato de habitaciones sigue pendiente, evidencia explícita del límite sin marcar RQ-12 como integración completa.
