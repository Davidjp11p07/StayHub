# Implementation Plan: Reports Service de StayHub

**Git branch actual**: `front-apigateway` (no se creó una rama nueva)  
**Spec Kit feature context**: `reports_service`  
**Date**: 2026-11-15  
**Spec**: `specs/004-inventario-reportes-recomendaciones-cierre/reports_service/spec.md`

**Input**: `tendencias.md` (RQ-12, Sprint 4 y RNF), constitución 1.0.0, repositorio actual, contratos implementados de Bookings/Payments/Accommodations y API Gateway después del merge `96600c8`.

## Summary

Construir `reports-service` como microservicio NestJS independiente en el puerto 3011 para entregar métricas por propietario de reservas, ingresos, ocupación, cancelaciones y tendencias. Reports tendrá arquitectura hexagonal pragmática, PostgreSQL 16 propio y una proyección eventualmente consistente alimentada por RabbitMQ. Consumirá eventos v1 ya publicados por Bookings y Payments, sin leer sus bases. Para una ocupación correcta consumirá un contrato versionado de habitaciones activas cuyo productor debe ser Accommodations —o el servicio que el equipo designe formalmente como autoridad del inventario—; esa dependencia se presenta como gate de integración, no como funcionalidad falsamente completada.

No se usará Redis en el MVP: las consultas agregadas se sirven desde tablas indexadas y SQL parametrizado. No se implementará frontend, RQ-13, exportaciones ni analítica predictiva. API Gateway solo requiere routing, circuito y JWT delegado; toda autorización se vuelve a comprobar dentro de Reports.

### Requisitos cumplidos por este desarrollo

| Requisito | Responsabilidad de Reports | Declaración de cumplimiento |
|---|---|---|
| **RQ-12** | Reservas, ingresos, ocupación, cancelaciones y tendencias por propietario. | Requisito principal; cumplimiento completo condicionado al contrato real de habitaciones activas. |
| **Sprint 4** | `reports-service` NestJS y dashboard estadístico backend. | Incluido. Frontend permanece separado. |
| **CA Sprint 4** | El propietario visualiza ocupación e ingresos. | Cubierto por `/reports/owner/{id}`, `/reports/occupancy` y `/reports/revenue`. |
| **RNF rendimiento** | p95 < 500 ms en consultas. | Gate de rendimiento con dataset reproducible. |
| **RNF seguridad** | JWT, roles, sanitización y HTTPS en Gateway. | JWT delegado RS256, OWNER propio/ADMIN cualquier propietario. |
| **RNF mantenibilidad** | TypeScript modular, OpenAPI y logs. | Arquitectura por capas, contratos versionados y observabilidad. |
| **RNF portabilidad** | `docker compose up`. | DB, migración, servicio, RabbitMQ y health checks documentados. |
| **RNF comunicación** | REST síncrono y RabbitMQ para hechos. | REST para lectura; eventos para construir la proyección. |

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.7.3 estricto  
**Primary Dependencies**: NestJS 10.4.22, Prisma/@prisma/client 6.19.0, `class-validator` 0.14.x, `class-transformer` 0.5.1, `@nestjs/swagger` 8.1.1, JOSE 5.9.6, `amqplib` 0.10.x, OpenTelemetry en las versiones ya fijadas por el monorepo  
**Storage**: `reports_db` PostgreSQL 16 exclusivo; Prisma para CRUD/transacciones y SQL parametrizado para agregaciones/series; sin Redis en MVP  
**Testing**: Jest 29.7 por proyectos `unit|integration|contract|security|performance|e2e`, Supertest 7, PostgreSQL 16 y RabbitMQ 3 reales y desechables  
**Target Platform**: contenedor Linux no-root, redes `reports-internal` y `services`  
**Project Type**: workspace npm `@stayhub/reports-service` dentro del monorepo NestJS  
**Performance Goals**: p95 < 500 ms y error < 1 % para periodos de hasta 366 días con dataset versionado  
**Constraints**: datos eventualmente consistentes; OWNER solo propio; importes separados por moneda; semántica `[from,to)` UTC; ack posterior al commit; sin acceso a DB ajena; no afirmar ocupación completa sin denominador autoritativo  
**Scale/Scope**: 3 endpoints públicos, 3 familias de eventos, 6 tablas de proyección/operación, un consumer con retry/DLQ y una integración de Gateway

No quedan decisiones técnicas sin resolver dentro del alcance de Reports: los límites se fijan en `research.md`. La identidad del segundo microservicio escogido para Sprint 4 no cambia este plan; la autoridad del inventario se mantiene en Accommodations hasta una decisión contractual explícita.

## Constitution Check

*Gate inicial y revisión post-diseño: PASS. La dependencia de capacidad se mantiene como gate de integración, no como excepción constitucional.*

| Principio | Cumplimiento del plan | Estado |
|---|---|---|
| I. Dominio independiente | Reports solo posee lectura analítica y proyecciones; no modifica reservas, pagos ni habitaciones. | PASS |
| II. Capas y dependencias | Dominio/aplicación dependen de puertos; HTTP, Prisma y RabbitMQ son adaptadores. | PASS |
| III. Datos propios | `reports_db` exclusiva; IDs externos opacos y sin FK entre servicios. | PASS |
| IV. Comunicación explícita | Eventos para hechos ya ocurridos; REST para consulta inmediata. Contratos, retry, ack y DLQ quedan documentados. | PASS |
| V. Seguridad | JWT delegado firmado, roles/ownership en Reports, DTO cerrado, logs sin PII. | PASS |
| VI. Código modular/tipado | TypeScript estricto, objetos de valor para periodo/dinero y módulos cohesivos. | PASS |
| VII. Contratos | OpenAPI y JSON Schema de consumidores versionados con drift tests. | PASS |
| VIII. Trazabilidad/verificación | Cada caso se vincula a RQ-12; unit, integración, contrato, seguridad, rendimiento y E2E. | PASS |
| Docker/portabilidad | Dockerfile multi-stage, migración separada, Compose, health checks y shutdown. | PASS |

## Project Structure

### Documentación

```text
specs/004-inventario-reportes-recomendaciones-cierre/reports_service/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi-reports-service.yaml
│   └── reports-consumed-events-v1.schema.json
└── tasks.md                         # futuro: $speckit-tasks, no creado aquí
```

### Código propuesto

```text
apps/reports-service/
├── package.json
├── tsconfig.json  tsconfig.build.json  jest.config.ts  README.md
├── prisma/
│   ├── schema.prisma
│   └── migrations/001_reports_projection/migration.sql
├── src/
│   ├── main.ts  app.module.ts
│   ├── domain/
│   │   ├── reporting-period.ts
│   │   ├── money-total.ts
│   │   ├── occupancy.ts
│   │   └── report-errors.ts
│   ├── application/
│   │   ├── ports/{report-query.port.ts,projection-unit-of-work.port.ts,clock.port.ts}
│   │   ├── queries/{get-owner-report.use-case.ts,get-occupancy-report.use-case.ts,get-revenue-report.use-case.ts}
│   │   └── projection/{consume-report-event.use-case.ts,retry-deferred-events.use-case.ts}
│   ├── infrastructure/
│   │   ├── config/{reports-config.ts,config.module.ts}
│   │   ├── persistence/prisma/{prisma.service.ts,prisma.module.ts,report-query.adapter.ts,
│   │   │                            projection-unit-of-work.adapter.ts,database-error.ts}
│   │   ├── messaging/{rabbitmq-report.consumer.ts,event-schema.validator.ts}
│   │   ├── security/{service-jwt.verifier.ts,report-principal.ts}
│   │   ├── observability/{reports-logger.ts,reports-metrics.ts,otel.ts}
│   │   └── lifecycle/graceful-shutdown.ts
│   ├── interfaces/
│   │   ├── http/{configure-http.ts,problem.filter.ts,validation.pipe.ts,trace.interceptor.ts}
│   │   ├── http/reports/{reports.controller.ts,report-query.dto.ts,report.presenter.ts}
│   │   ├── http/guards/{service-auth.guard.ts,report-access.guard.ts}
│   │   └── openapi/{openapi.factory.ts,reports.openapi.ts,schemas.ts}
│   └── modules/{reports.module.ts,projection.module.ts,health/}
└── test/
    ├── unit/
    ├── integration/
    ├── contract/
    ├── security/
    ├── performance/
    ├── e2e/
    └── fixtures/{events,report-dataset.ts,jwt.fixture.ts}

infra/docker/reports/Dockerfile
```

Fuera del workspace: registrar `reports-service` en `package.json`, `nest-cli.json`, `tsconfig.base.json`, `.env.example`, CI y `docker-compose.yml`. Los cambios compartidos deben realizarse en tareas explícitas y coordinadas para evitar nuevos conflictos con API Gateway.

**Structure Decision**: arquitectura hexagonal pragmática igual a Search/Bookings/Payments: dominio puro, aplicación con puertos, infraestructura con Prisma/RabbitMQ/JWT y adaptadores HTTP delgados.

## Responsabilidad por capa

- **Domain**: valida `ReportingPeriod`, calcula tasas sin división inválida, representa totales por moneda y define fórmulas. Sin NestJS, Prisma, SQL o RabbitMQ.
- **Application**: ejecuta las tres consultas y coordina aplicación idempotente de eventos. Decide ownership, semántica de periodo y estados `APPLIED|DUPLICATE|DEFERRED|REJECTED` mediante puertos.
- **Infrastructure**: transacciones Prisma, SQL parametrizado para agregaciones, validación JSON Schema, consumer RabbitMQ, retry/DLQ, JWT, métricas y logs.
- **Interfaces**: DTOs cerrados, guards, presenters, Problem Details y Swagger. No contiene fórmulas ni acceso directo a Prisma.

## Modelo de proyección

Reports guarda hechos mínimos, no copias completas de los agregados externos:

1. `report_booking_facts`: vínculo estable `bookingId → ownerId/propertyId/roomId`, periodo de estadía, estado y timestamps de eventos.
2. `report_payment_facts`: pago aprobado y acumulado reembolsado por `bookingId`, moneda y timestamps.
3. `report_room_activity_periods`: intervalos efectivos de habitación activa para el denominador de ocupación.
4. `processed_report_events`: inbox idempotente con hash, outcome y error seguro.
5. `deferred_report_events`: eventos válidos cuyo antecedente todavía no existe, con backoff y máximo de intentos.
6. `report_projection_state`: frescura por fuente, backlog diferido y cobertura del inventario para exponer `dataAsOf` sin guardar PII.

No se persiste `guestId`, nombre, correo, método de pago, token ni cuerpo completo del mensaje. Los payloads diferidos se reducen al subconjunto permitido antes de persistir.

## Contratos HTTP

Todas las rutas internas de Reports se publican detrás de `/api/v1` en Gateway y usan JWT delegado con `aud=stayhub-reports-service`, `scope=reports:read`, `sub=userId` y claim `role`.

### `GET /reports/owner/{ownerId}`

- Query obligatoria: `from`, `to`; opcional `granularity=day|week|month` (default técnico `day`).
- OWNER: `ownerId == sub`; ADMIN: cualquier `ownerId` válido.
- Devuelve resumen de reservas/cancelaciones, ocupación, ingresos por moneda y serie temporal.

### `GET /reports/occupancy`

- Query: `ownerId`, `from`, `to`, `granularity`.
- Devuelve noches ocupadas/disponibles, tasa global y buckets.
- Si falta la proyección de habitaciones para parte del periodo, devuelve `coverage.complete=false`; nunca inventa un denominador.

### `GET /reports/revenue`

- Query: `ownerId`, `from`, `to`, `granularity`.
- Devuelve `grossApprovedMinor`, `refundedMinor` y `netMinor` por moneda, más buckets.

Reglas comunes: `from` inclusivo, `to` exclusivo, máximo 366 días, fechas UTC, `Cache-Control: private, max-age=30`, Problem Details para 400/401/403/404/422/503.

## Contratos de eventos

### Existentes y reutilizados

| Productor/exchange | Binding | Uso en Reports |
|---|---|---|
| Bookings / `stayhub.bookings.v1` | `booking.v1.created` | owner/property/room, fechas, total previsto y reserva creada. |
| Bookings / `stayhub.bookings.v1` | `booking.v1.confirmed` | confirmación y datos de estadía. |
| Bookings / `stayhub.bookings.v1` | `booking.v1.cancelled` | cancelación y actor. |
| Bookings / `stayhub.bookings.v1` | `booking.v1.completed` | estadía completada. |
| Payments / `stayhub.payments` | `payment.approved` | ingreso bruto definitivo. |
| Payments / `stayhub.payments` | `payment.refunded` | reembolso definitivo. |

### Contrato técnico requerido para ocupación

`accommodation.v1.room-reporting-upserted` debe incluir `eventId`, `schemaVersion=1`, `occurredAt`, `ownerId`, `propertyId`, `roomId`, `active`, `effectiveFrom` y `projectionVersion`. Su productor autoritativo es Accommodations mientras el equipo no transfiera explícitamente esa responsabilidad. El evento expresa capacidad, no productos ni servicios de habitación.

Reports usa una cola exclusiva `stayhub.reports.projection.v1`, retry queue con TTL y DLQ `stayhub.reports.projection.v1.dlq`. Entrega at-least-once; ack solo después del commit. Un `eventId` repetido con el mismo hash es `DUPLICATE`; con hash distinto es `REJECTED` y va a DLQ. Eventos fuera de orden se guardan como `DEFERRED` y el worker los reintenta sin bloquear la cola.

## Definición de métricas

- **Reservas**: conteo por `occurredAt` de eventos created/confirmed/completed.
- **Cancelaciones**: conteo de cancelled por `occurredAt` y `cancelledBy`.
- **Tasa de cancelación**: cancelaciones / (confirmaciones + cancelaciones) del bucket; `null` sin denominador.
- **Noches ocupadas**: intersección de `[checkIn,checkOut)` con el periodo para reservas confirmadas/completadas cuyo estado final no sea cancelled.
- **Noches disponibles**: suma por día de habitaciones activas según intervalos efectivos.
- **Ingresos**: approved menos refunded por `occurredAt`, siempre por moneda. No se usa el total previsto de Booking como ingreso realizado.
- **Tendencias**: buckets UTC `day|week|month`; las sumas de buckets deben reconciliar con el total de la respuesta.

## Persistencia y consultas

- Prisma modela tablas, constraints, migraciones e inbox.
- SQL especializado se encapsula en `report-query.adapter.ts` usando `Prisma.sql`, `Prisma.join` y parámetros; nunca concatenación de entrada.
- Índices mínimos: `(owner_id, occurred_at)`, `(owner_id, check_in, check_out)`, `(booking_id)`, `(owner_id, currency, approved_at)`; GiST/range solo si el plan de consulta medido lo justifica.
- Las transacciones de consumo son cortas y no realizan llamadas externas.
- El MVP calcula agregados bajo demanda. No agrega rollups ni Redis antes de medir; si p95 falla, la primera optimización será un rollup diario reconstruible dentro de Reports.

## Seguridad

- Reports acepta únicamente service JWT del Gateway: RS256, `kid`, `iss`, `aud`, `exp`, `iat` y scope exacto.
- El servicio deriva `sub` y `role` del token; ignora/rechaza cabeceras `x-user-id`, `x-role` o parámetros que intenten reemplazarlos.
- OWNER solo consulta su UUID; ADMIN puede consultar cualquier owner específico. GUEST queda rechazado.
- DTO `whitelist + forbidNonWhitelisted`, límites de periodo y granularidad cerrada.
- Respuestas agregadas sin PII; logs redactan JWT, URLs sensibles y payloads de eventos.
- Secretos por `_FILE` en Compose, contenedor no-root, filesystem read-only y `no-new-privileges`.

## Observabilidad y salud

- Logs JSON: `traceId`, ruta, actorRole, ownerId pseudonimizado, periodo, duración, projectionAsOf; sin payload completo.
- Métricas: `reports_http_duration_seconds`, `reports_query_duration_seconds`, `reports_events_total{type,outcome}`, `reports_event_lag_seconds`, `reports_deferred_events`, `reports_dlq_total`, `reports_projection_as_of_seconds`, `reports_occupancy_coverage_ratio`.
- Trazas: Gateway → controller → use case → PostgreSQL; RabbitMQ → validator → transacción.
- `/health/live`: proceso vivo.
- `/health/ready`: configuración, PostgreSQL y migraciones obligatorios. RabbitMQ caído se reporta `degraded`; las lecturas existentes siguen disponibles y muestran `dataAsOf`.
- Shutdown: detener HTTP, cancelar consumo, esperar handlers, cerrar canal/conexión y Prisma.

## API Gateway

La integración sigue el patrón de Bookings después del merge:

- `GATEWAY_REPORTS_BASE_URL`, timeout y circuito.
- audience `stayhub-reports-service`, scope `reports:read`.
- JWT delegado con `sub`/`role`; sin confiar en headers de identidad.
- rutas OWNER/ADMIN, allowlist de query y propagación de Problem Details/trace.
- Swagger público sincronizado y pruebas Gateway → stub Reports; E2E real en integración.

Gateway no calcula métricas ni transforma importes. Estos cambios deben hacerse en una tarea coordinada porque `app.module.ts`, configuración, Compose y scripts de desarrollo fueron archivos conflictivos en el merge reciente.

## Docker y configuración

- `reports-db`: PostgreSQL 16, volumen propio, credencial por secret y red `reports-internal`.
- `reports-migrate`: target `migration`, espera DB sana, ejecuta `prisma migrate deploy`, `restart: "no"`.
- `reports-service`: target runtime Node 20, puerto 3011, no-root/read-only, redes `reports-internal` y `services`, health check, `restart: unless-stopped`.
- RabbitMQ es dependencia operacional blanda para lectura: el servicio puede servir la última proyección si el broker cae, con estado degradado.

Variables prefijadas `REPORTS_`: puerto, DB URL file, service JWT issuer/audience/kid/public key/scope, exchanges de Bookings/Payments/Accommodations, queue/retry/DLQ, prefetch, retry count/delay, rango máximo, timeout SQL, OTLP y shutdown grace.

## Estrategia de pruebas

| Suite | Evidencia requerida |
|---|---|
| unit | Periodos `[from,to)`, intersección de noches, tasa con denominador cero, dinero por moneda, autorización y backoff. |
| integration PostgreSQL | migración desde cero, duplicate/hash conflict, eventos fuera de orden, concurrencia, agregaciones, intervalos activos y SQL injection. |
| integration RabbitMQ | bindings reales, ack post-commit, reentrega, retry, DLQ y recuperación del broker. |
| contract | OpenAPI, fixtures contra schemas reales de Bookings/Payments y contrato de habitación con provider handoff. |
| security | OWNER ajeno, GUEST, ADMIN, JWT inválido, spoofed headers, query extra, periodo excesivo y logs sin PII. |
| performance | dataset versionado, p95 < 500 ms, error < 1 %, explain plan registrado. |
| e2e | Gateway → Reports → PostgreSQL con eventos consumidos; luego productores reales en Compose. |

Cobertura global mínima 70 %, sin sustituir pruebas de comportamiento.

## Dependencias y orden de implementación

1. Congelar OpenAPI, schemas consumidores y fórmula de métricas.
2. Crear workspace, configuración, Dockerfile y migración.
3. Implementar dominio/puertos y proyección PostgreSQL con fixtures.
4. Implementar consumer Bookings/Payments y pruebas RabbitMQ.
5. Implementar queries/endpoints y seguridad.
6. Coordinar contrato de habitaciones activas; ejecutar provider-consumer.
7. Integrar Gateway y Compose.
8. Ejecutar seguridad, rendimiento, E2E y auditoría RQ-12.

Pueden avanzar en paralelo después del paso 1: dominio/query, infraestructura PostgreSQL, consumer RabbitMQ y cliente Gateway contra stubs. La ocupación completa y el E2E distribuido dependen del contrato de habitaciones.

## Corte por tiempo

La fuente asigna **16 horas** a “Dashboard de reportes (NestJS)”. Ese presupuesto se conserva como corte MVP: workspace, migración, consumo de eventos existentes con fixtures, tres consultas, seguridad básica, OpenAPI y pruebas esenciales. La integración provider real de habitaciones, Gateway/Compose completo, rendimiento y hardening son gates de cierre y requieren coordinación con otros equipos; si no caben, deben quedar explícitamente pendientes y no marcar RQ-12 como completamente integrado.

Prioridad de reducción si el tiempo no alcanza:

1. Mantener resumen/ingresos/cancelaciones y ocupación correcta sin gráficos/exportaciones.
2. Reducir granularidad inicial a `day`, conservando el contrato ampliable.
3. No agregar Redis, materialized views, PDF/Excel ni ML.
4. Nunca sustituir el denominador de ocupación por “habitaciones que tuvieron reserva”.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Ocupación incorrecta por ausencia de habitaciones sin reservas | Contrato de actividad de habitaciones como gate; `coverage.complete=false` mientras falte. |
| Eventos duplicados/fuera de orden | Inbox con hash, deferred queue persistente, retry/DLQ y pruebas concurrentes. |
| Ingreso duplicado o mezcla de monedas | `eventId` único, dinero en minor units y agregación por currency. |
| Reportes obsoletos con RabbitMQ caído | `dataAsOf`, health degraded, lag/backlog metrics y alertas. |
| Consulta lenta | rangos máximos, índices, SQL parametrizado y perfil p95 antes de añadir rollups. |
| Fuga de información entre propietarios | guard en Reports, token delegado, pruebas OWNER ajeno/GUEST/spoofing. |
| Nuevos conflictos en Gateway/Compose | tareas compartidas pequeñas y coordinadas; no editar esos archivos en paralelo sin acuerdo. |
| 16 horas insuficientes | corte MVP explícito y prohibición de declarar integraciones simuladas como reales. |

## Criterios técnicos de terminado

- Los tres endpoints cumplen OpenAPI y autorización.
- Proyección idempotente contra PostgreSQL real y RabbitMQ real.
- Ingresos reconciliados por moneda con fixtures de Payments.
- Ocupación incluye habitaciones activas sin reservas mediante contrato provider real.
- p95 < 500 ms, cobertura >= 70 %, lint/typecheck/build verdes.
- Gateway y Compose ejecutados con evidencia; imagen no-root y shutdown verificados.
- RQ-12 trazado y revisado por otra persona.

## Complexity Tracking

Sin violaciones constitucionales. RabbitMQ, inbox y deferred events son necesarios por entrega at-least-once y proyecciones cruzadas. No se añade Redis ni una capa de rollups sin evidencia de rendimiento.
