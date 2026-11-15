---
description: "Tareas ejecutables para implementar reports-service del Sprint 4"
---

# Tasks: Reports Service de StayHub

**Input**: documentos de diseño en `specs/004-inventario-reportes-recomendaciones-cierre/reports_service/`  
**Requisito**: RQ-12  
**Alcance**: backend de Reports y sus integraciones mínimas; sin frontend, RQ-13 ni otros microservicios del Sprint 4.

## Formato

- **[P]**: puede ejecutarse en paralelo porque no comparte archivos ni depende de una tarea incompleta.
- **[US1]…[US4]**: trazabilidad con las historias de `spec.md`.
- Las pruebas de cada historia se escriben primero y deben fallar antes de implementar el comportamiento.
- Las dependencias externas no autorizan a modificar otro microservicio; exigen coordinación y evidencia contractual.

## Phase 1: Setup del microservicio

**Objetivo**: incorporar el workspace NestJS vacío y su infraestructura básica sin lógica funcional.

- [ ] T001 Crear el workspace `@stayhub/reports-service` con dependencias NestJS 10.4.22, Prisma 6.19, TypeScript 5.7, JOSE, amqplib, Swagger, OpenTelemetry, Jest y Supertest en `apps/reports-service/package.json`
- [ ] T002 [P] Configurar TypeScript estricto, build, Jest por proyectos y ESLint siguiendo Bookings/Payments en `apps/reports-service/tsconfig.json`, `apps/reports-service/tsconfig.build.json`, `apps/reports-service/jest.config.ts` y `apps/reports-service/eslint.config.mjs`
- [ ] T003 Registrar el workspace y scripts `build|lint|typecheck|test|coverage|prisma|openapi` de Reports en `package.json` (depends on T001)
- [ ] T004 [P] Documentar únicamente variables `REPORTS_*`, valores locales no secretos y variantes `_FILE` en `apps/reports-service/.env.example`
- [ ] T005 [P] Crear imagen multi-stage Node 20, usuario no-root, filesystem compatible con read-only y targets runtime/migration en `infra/docker/reports/Dockerfile` y `infra/docker/reports/Dockerfile.dockerignore`
- [ ] T006 Incorporar `reports-db`, `reports-migrate` y `reports-service` con puerto 3011, redes, secrets, health checks y restart policy en `docker-compose.services.yml` (depends on T005)
- [ ] T007 [P] Añadir los gates de Reports sin alterar gates existentes en `.github/workflows/ci.yml`
- [ ] T008 [P] Documentar arquitectura, comandos reales, variables y límites de consistencia eventual en `apps/reports-service/README.md`

**Checkpoint**: el workspace instala, compila vacío y está declarado en Compose/CI.

---

## Phase 2: Fundamentos bloqueantes

**Objetivo**: establecer configuración, persistencia, contratos, seguridad y adaptadores comunes requeridos por todas las historias.

**CRÍTICO**: ninguna historia comienza antes de completar esta fase.

- [ ] T009 [P] Crear pruebas fallidas para variables requeridas, `_FILE`, rangos, defaults seguros y rechazo de secretos ausentes en `apps/reports-service/test/unit/reports-config.spec.ts`
- [ ] T010 Implementar carga y validación fail-fast de todas las variables `REPORTS_*` en `apps/reports-service/src/infrastructure/config/reports-config.ts` y `apps/reports-service/src/infrastructure/config/config.module.ts` (depends on T009)
- [ ] T011 Modelar las seis tablas en `apps/reports-service/prisma/schema.prisma`: `report_booking_facts` con UUID PK, owner/property/room requeridos, `check_out > check_in`, `planned_total_minor >= 0`, moneda `CHAR(3)`, estado `CREATED|CONFIRMED|CANCELLED|COMPLETED` y `cancelled_by GUEST|OWNER|ADMIN|SYSTEM`; `report_payment_facts` con `approved_amount_minor > 0` y `0 <= refunded_amount_minor <= approved_amount_minor`; `report_room_activity_periods` con `effective_to > effective_from`, versión monotónica y `(room_id,projection_version)` único; inbox con `payload_hash CHAR(64)` y outcome `APPLIED|IGNORED|DEFERRED`; deferred con `attempts >= 0`; projection state singleton; sin `guest_id` ni `payer_user_id`
- [ ] T012 Crear migración inicial con tablas, checks, unicidad e índices `(owner_id,check_in,check_out)`, `(room_id,check_in,check_out)`, `(owner_id,status,created_at)`, `(booking_id,currency,approved_at)`, `(owner_id,effective_from,effective_to)` y `next_attempt_at` en `apps/reports-service/prisma/migrations/001_reports_projection/migration.sql` (depends on T011)
- [ ] T013 [P] Crear prueba de migración desde PostgreSQL 16 vacío, constraints e índices esperados en `apps/reports-service/test/integration/migrations-health.spec.ts` (depends on T012)
- [ ] T014 Implementar conexión, shutdown y readiness de Prisma sin acceso a bases ajenas en `apps/reports-service/src/infrastructure/persistence/prisma/prisma.service.ts` y `apps/reports-service/src/infrastructure/persistence/prisma/prisma.module.ts` (depends on T011)
- [ ] T015 [P] Definir errores tipados, reloj y puertos de consulta/proyección sin imports de NestJS o Prisma en `apps/reports-service/src/domain/report-errors.ts`, `apps/reports-service/src/application/ports/clock.port.ts`, `apps/reports-service/src/application/ports/report-query.port.ts` y `apps/reports-service/src/application/ports/projection-unit-of-work.port.ts`
- [ ] T016 [P] Crear fixtures mínimos y sanitizados que reproduzcan los eventos reales v1 de Bookings, Payments y habitación en `apps/reports-service/test/fixtures/events/booking-events.ts`, `apps/reports-service/test/fixtures/events/payment-events.ts` y `apps/reports-service/test/fixtures/events/room-events.ts`
- [ ] T017 [P] Crear pruebas de contrato que compilen `reports-consumed-events-v1.schema.json`, validen los fixtures y detecten drift frente a los schemas provider existentes en `apps/reports-service/test/contract/consumed-events.contract.spec.ts` (depends on T016)
- [ ] T018 [P] Crear pruebas unitarias de validación cerrada, versión, `eventId`, hash canónico y rechazo de payload desconocido en `apps/reports-service/test/unit/event-schema.validator.spec.ts`
- [ ] T019 Implementar validación JSON Schema, normalización permitida y hash SHA-256 determinista sin persistir PII en `apps/reports-service/src/infrastructure/messaging/event-schema.validator.ts` (depends on T017, T018)
- [ ] T020 [P] Crear pruebas fallidas para RS256, `kid`, issuer, audience `stayhub-reports-service`, scope `reports:read`, expiración, OWNER propio, ADMIN y GUEST en `apps/reports-service/test/security/service-auth.spec.ts`
- [ ] T021 Implementar principal, verificador JWT y guards que ignoran/rechazan headers de identidad suplantados en `apps/reports-service/src/infrastructure/security/report-principal.ts`, `apps/reports-service/src/infrastructure/security/service-jwt.verifier.ts`, `apps/reports-service/src/interfaces/http/guards/service-auth.guard.ts` y `apps/reports-service/src/interfaces/http/guards/report-access.guard.ts` (depends on T020)
- [ ] T022 [P] Implementar ValidationPipe `whitelist + forbidNonWhitelisted`, Problem Details, trace ID e interceptor de duración en `apps/reports-service/src/interfaces/http/validation.pipe.ts`, `apps/reports-service/src/interfaces/http/problem.filter.ts` y `apps/reports-service/src/interfaces/http/trace.interceptor.ts`
- [ ] T023 [P] Crear pruebas de liveness, readiness PostgreSQL y estado degradado de dependencias en `apps/reports-service/test/integration/health.spec.ts`
- [ ] T024 Implementar logs JSON redactados, métricas base y health module sin incluir JWT ni payloads completos en `apps/reports-service/src/infrastructure/observability/reports-logger.ts`, `apps/reports-service/src/infrastructure/observability/reports-metrics.ts`, `apps/reports-service/src/modules/health/health.controller.ts` y `apps/reports-service/src/modules/health/health.module.ts` (depends on T023)
- [ ] T025 [P] Crear prueba de drift que valide el OpenAPI 3.1 y sus tres operaciones en `apps/reports-service/test/contract/openapi-drift.spec.ts`
- [ ] T026 Implementar generación Swagger sin duplicar contratos y configuración HTTP común en `apps/reports-service/src/interfaces/openapi/openapi.factory.ts`, `apps/reports-service/src/interfaces/openapi/reports.openapi.ts` y `apps/reports-service/src/interfaces/http/configure-http.ts` (depends on T022, T025)
- [ ] T027 Ensamblar bootstrap, configuración, Prisma, salud y cierre básico en `apps/reports-service/src/main.ts` y `apps/reports-service/src/app.module.ts` (depends on T010, T014, T021, T024, T026)

**Checkpoint**: la base migra, el servicio arranca, autentica y publica salud/OpenAPI, todavía sin casos de uso de reportes.

---

## Phase 3: US1 — Resumen del propietario (P1) 🎯 MVP

**Goal**: entregar `GET /reports/owner/{ownerId}` con resumen, tendencias, frescura y cobertura desde una proyección sembrada.

**Independent Test**: sembrar hechos de un propietario y comprobar que OWNER propio/ADMIN reciben conteos e importes separados por moneda, mientras OWNER ajeno no obtiene datos.

### Pruebas primero

- [ ] T028 [P] [US1] Crear pruebas unitarias de periodo `[from,to)`, máximo 366 días, granularidad y tasa de cancelación `cancelled/(confirmed+cancelled)` con `null` sin denominador en `apps/reports-service/test/unit/reporting-period.spec.ts`
- [ ] T029 [P] [US1] Crear prueba contractual de `GET /reports/owner/{ownerId}` para 200/400/401/403 y respuesta sin PII en `apps/reports-service/test/contract/owner-report.contract.spec.ts`
- [ ] T030 [P] [US1] Crear prueba de integración PostgreSQL para resumen, buckets UTC, monedas separadas y `dataAsOf` en `apps/reports-service/test/integration/owner-report-query.spec.ts`
- [ ] T031 [P] [US1] Crear prueba de seguridad OWNER propio/ajeno, ADMIN, GUEST y headers suplantados para el resumen en `apps/reports-service/test/security/owner-report-access.spec.ts`

### Implementación

- [ ] T032 [P] [US1] Implementar objetos de valor `ReportingPeriod` y totales monetarios por moneda sin dependencias de framework en `apps/reports-service/src/domain/reporting-period.ts` y `apps/reports-service/src/domain/money-total.ts` (depends on T028)
- [ ] T033 [US1] Implementar consulta SQL parametrizada del resumen y tendencias con `Prisma.sql`/`Prisma.join`, nunca concatenación de entrada, en `apps/reports-service/src/infrastructure/persistence/prisma/report-query.adapter.ts` (depends on T030, T032)
- [ ] T034 [US1] Implementar autorización de ownership y coordinación del resumen en `apps/reports-service/src/application/queries/get-owner-report.use-case.ts` (depends on T021, T033)
- [ ] T035 [P] [US1] Implementar DTO cerrado y presenter con `metadata`, `dataAsOf`, `coverage`, importes por moneda y sin PII en `apps/reports-service/src/interfaces/http/reports/report-query.dto.ts` y `apps/reports-service/src/interfaces/http/reports/report.presenter.ts` (depends on T029)
- [ ] T036 [US1] Implementar `GET /reports/owner/:ownerId` y sus errores Problem Details en `apps/reports-service/src/interfaces/http/reports/reports.controller.ts` (depends on T034, T035)
- [ ] T037 [US1] Registrar controller, caso de uso, query adapter y guards en `apps/reports-service/src/modules/reports.module.ts` y `apps/reports-service/src/app.module.ts` (depends on T036)

**Checkpoint**: US1 funciona de forma independiente sobre datos proyectados sembrados. Aún no demuestra consumo real ni ocupación autoritativa.

---

## Phase 4: US2 — Ocupación y tendencias (P1)

**Goal**: calcular noches ocupadas/disponibles correctamente y exponer `GET /reports/occupancy`.

**Independent Test**: dos habitaciones activas durante dos noches y una reserva de una habitación por una noche producen 25 %; una habitación sin reservas permanece en el denominador y denominador cero produce `null`.

### Pruebas primero

- [ ] T038 [P] [US2] Crear pruebas unitarias de intersección nocturna, exclusión de canceladas, no doble conteo y denominador cero en `apps/reports-service/test/unit/occupancy.spec.ts`
- [ ] T039 [P] [US2] Crear prueba contractual de `GET /reports/occupancy` para granularidad day/week/month y estado `coverage.complete` en `apps/reports-service/test/contract/occupancy-report.contract.spec.ts`
- [ ] T040 [P] [US2] Crear integración PostgreSQL para intervalos activos, habitaciones sin reservas, límites `[from,to)` e intervalos no superpuestos en `apps/reports-service/test/integration/occupancy-query.spec.ts`
- [ ] T041 [P] [US2] Crear pruebas de aplicación de `booking.v1.created|confirmed|cancelled|completed` y `accommodation.v1.room-reporting-upserted` en `apps/reports-service/test/integration/occupancy-projection.spec.ts`

### Implementación

- [ ] T042 [P] [US2] Implementar fórmula pura de ocupación y tipos de cobertura en `apps/reports-service/src/domain/occupancy.ts` (depends on T038)
- [ ] T043 [US2] Implementar handlers de reservas y actividad de habitaciones con versiones monotónicas y sin guardar `guestId` en `apps/reports-service/src/application/projection/apply-booking-event.ts` y `apps/reports-service/src/application/projection/apply-room-event.ts` (depends on T041)
- [ ] T044 [US2] Añadir agregación parametrizada de noches ocupadas/disponibles y buckets UTC a `apps/reports-service/src/infrastructure/persistence/prisma/report-query.adapter.ts` (depends on T040, T042)
- [ ] T045 [US2] Implementar `GetOccupancyReportUseCase` con `coverage.complete=false` cuando falte inventario en `apps/reports-service/src/application/queries/get-occupancy-report.use-case.ts` (depends on T044)
- [ ] T046 [US2] Exponer `GET /reports/occupancy` reutilizando DTO, presenter y guards en `apps/reports-service/src/interfaces/http/reports/reports.controller.ts` y `apps/reports-service/src/modules/reports.module.ts` (depends on T039, T045)
- [ ] T047 [US2] Validar como dependencia externa el contrato provider-consumer de habitaciones contra un productor real de Accommodations y registrar el resultado sin modificar ese servicio en `specs/004-inventario-reportes-recomendaciones-cierre/reports_service/verification.md` (depends externally on Accommodations; depends on T043)

**Checkpoint**: US2 es verificable con fixtures; solo se declara integrada cuando T047 demuestra el productor real.

---

## Phase 5: US3 — Ingresos netos (P1)

**Goal**: proyectar pagos/reembolsos y exponer ingresos por moneda en `GET /reports/revenue`.

**Independent Test**: 10000 COP aprobados menos 2500 COP reembolsados producen 7500 COP; USD permanece separado y un total de Booking sin aprobación no cuenta como ingreso.

### Pruebas primero

- [ ] T048 [P] [US3] Crear pruebas unitarias de minor units, monedas separadas, reembolso acumulado y neto negativo por periodo en `apps/reports-service/test/unit/revenue.spec.ts`
- [ ] T049 [P] [US3] Crear prueba contractual de `GET /reports/revenue` y schemas `Money`/series en `apps/reports-service/test/contract/revenue-report.contract.spec.ts`
- [ ] T050 [P] [US3] Crear integración PostgreSQL para aprobado, reembolsos acumulados, periodo financiero y pago anterior con reembolso actual en `apps/reports-service/test/integration/revenue-query.spec.ts`
- [ ] T051 [P] [US3] Crear prueba provider-consumer contra el schema real de Payments para `payment.v1.approved|refunded` en `apps/reports-service/test/contract/payments-provider.contract.spec.ts`

### Implementación

- [ ] T052 [US3] Implementar handler de pagos que conserve solo booking, montos, moneda y timestamps, sin `payerUserId`, en `apps/reports-service/src/application/projection/apply-payment-event.ts` (depends on T050, T051)
- [ ] T053 [US3] Añadir agregación SQL parametrizada de aprobados, reembolsos y neto por moneda/bucket a `apps/reports-service/src/infrastructure/persistence/prisma/report-query.adapter.ts` (depends on T048, T050)
- [ ] T054 [US3] Implementar `GetRevenueReportUseCase` sin conversión FX ni uso de `booking.total` como ingreso en `apps/reports-service/src/application/queries/get-revenue-report.use-case.ts` (depends on T053)
- [ ] T055 [US3] Exponer `GET /reports/revenue` con DTO/presenter existentes en `apps/reports-service/src/interfaces/http/reports/reports.controller.ts` y `apps/reports-service/src/modules/reports.module.ts` (depends on T049, T054)
- [ ] T056 [US3] Integrar totales financieros reales dentro del resumen US1 sin duplicar fórmulas en `apps/reports-service/src/application/queries/get-owner-report.use-case.ts` (depends on T052, T054)

**Checkpoint**: US3 reconcilia pagos y reembolsos reales por moneda y el resumen US1 deja de depender de datos financieros sembrados.

---

## Phase 6: US4 — Proyección confiable (P2)

**Goal**: consumir eventos at-least-once con transacción, deduplicación, diferidos, retry y DLQ observables.

**Independent Test**: duplicado idéntico no muta; mismo ID con hash distinto va a rechazo/DLQ; pago antes de reserva se difiere y luego se aplica; RabbitMQ recibe ack solo después del commit.

### Pruebas primero

- [ ] T057 [P] [US4] Crear pruebas unitarias de outcomes `APPLIED|DUPLICATE|DEFERRED|REJECTED` y backoff limitado en `apps/reports-service/test/unit/consume-report-event.use-case.spec.ts`
- [ ] T058 [P] [US4] Crear pruebas PostgreSQL de inbox atómico, hash conflictivo, eventos fuera de orden y actualización de `report_projection_state` en `apps/reports-service/test/integration/projection-unit-of-work.spec.ts`
- [ ] T059 [P] [US4] Crear pruebas con RabbitMQ real para bindings, ack post-commit, redelivery, retry TTL, DLQ y recuperación del broker en `apps/reports-service/test/integration/rabbitmq-report-consumer.spec.ts`
- [ ] T060 [P] [US4] Crear prueba concurrente que demuestre una sola aplicación de dos entregas simultáneas del mismo evento en `apps/reports-service/test/integration/projection-concurrency.spec.ts`

### Implementación

- [ ] T061 [US4] Implementar unidad de trabajo Prisma que persista inbox y mutación en una transacción, detecte hash conflictivo y serialice duplicados concurrentes en `apps/reports-service/src/infrastructure/persistence/prisma/projection-unit-of-work.adapter.ts` (depends on T058, T060)
- [ ] T062 [US4] Implementar enrutamiento tipado a handlers de Booking/Payment/Room y outcomes auditables en `apps/reports-service/src/application/projection/consume-report-event.use-case.ts` (depends on T043, T052, T057, T061)
- [ ] T063 [P] [US4] Implementar repositorio y worker de diferidos con payload reducido, `attempts >= 0`, `next_attempt_at`, máximo configurable y error seguro en `apps/reports-service/src/application/projection/retry-deferred-events.use-case.ts` y `apps/reports-service/src/infrastructure/persistence/prisma/deferred-events.repository.ts` (depends on T058)
- [ ] T064 [US4] Implementar topología durable `stayhub.reports.projection.v1`, retry queue, DLQ, prefetch, validación previa y ack/nack posterior al resultado en `apps/reports-service/src/infrastructure/messaging/rabbitmq-report.consumer.ts` (depends on T019, T059, T062)
- [ ] T065 [US4] Registrar consumer y worker con inicio/cierre ordenado en `apps/reports-service/src/modules/projection.module.ts` y `apps/reports-service/src/app.module.ts` (depends on T063, T064)
- [ ] T066 [US4] Exponer `dataAsOf`, lag, backlog diferido y cobertura desde `report_projection_state` en `apps/reports-service/src/infrastructure/persistence/prisma/report-query.adapter.ts` y `apps/reports-service/src/interfaces/http/reports/report.presenter.ts` (depends on T061)
- [ ] T067 [US4] Instrumentar outcomes, lag, DLQ, backlog y logs redactados con `traceId` en `apps/reports-service/src/infrastructure/observability/reports-metrics.ts` y `apps/reports-service/src/infrastructure/observability/reports-logger.ts` (depends on T064)
- [ ] T068 [US4] Actualizar readiness para diferenciar PostgreSQL no disponible de RabbitMQ degradado sin bloquear lecturas existentes en `apps/reports-service/src/modules/health/health.controller.ts` (depends on T024, T064)
- [ ] T069 [US4] Implementar replay controlado e idempotente desde eventos validados, sin bypass del inbox, en `apps/reports-service/scripts/replay-report-events.mjs` y documentarlo en `apps/reports-service/README.md` (depends on T062)

**Checkpoint**: la proyección es recuperable y tolera duplicados, desorden y fallos temporales con evidencia real.

---

## Phase 7: Integración, rendimiento y cierre

**Objetivo**: conectar Gateway/Compose, verificar RNF y producir evidencia honesta de RQ-12.

- [ ] T070 [P] Crear pruebas Gateway → stub Reports para routing, query allowlist, timeout/circuito, Problem Details y JWT delegado en `apps/api-gateway/test/integration/reports-proxy.spec.ts`
- [ ] T071 Implementar cliente Reports con audience `stayhub-reports-service`, scope `reports:read`, timeout y circuito existentes en `apps/api-gateway/src/infrastructure/http/reports.client.ts` (depends on T070)
- [ ] T072 Implementar proxy delgado de las tres rutas, sin cálculos ni transformación de importes, en `apps/api-gateway/src/modules/reports/reports.controller.ts`, `apps/api-gateway/src/modules/reports/reports-proxy.module.ts` y `apps/api-gateway/src/modules/reports/reports.openapi.ts` (depends on T071)
- [ ] T073 Registrar `GATEWAY_REPORTS_BASE_URL`, configuración y módulo Reports de forma coordinada para evitar conflictos en `apps/api-gateway/src/infrastructure/config/gateway-config.ts` y `apps/api-gateway/src/app.module.ts` (depends on T072)
- [ ] T074 Integrar secretos, redes, startup order y health checks definitivos de Gateway/Reports/PostgreSQL/RabbitMQ en `docker-compose.services.yml` y `scripts/generate-services-dev-env.mjs` (depends on T006, T065, T073)
- [ ] T075 [P] Crear dataset reproducible de reservas, habitaciones, pagos y reembolsos para 366 días en `apps/reports-service/test/fixtures/report-dataset.ts`
- [ ] T076 Crear prueba de rendimiento con p95 < 500 ms, error < 1 % y EXPLAIN registrado sin introducir Redis/rollups antes de medir en `apps/reports-service/test/performance/reports-performance.spec.ts` (depends on T033, T044, T053, T075)
- [ ] T077 [P] Completar suite negativa para query extra, fechas inválidas, rango >366, SQL injection, JWT inválido y logs sin PII en `apps/reports-service/test/security/reports-security.spec.ts`
- [ ] T078 [P] Crear prueba contractual y de integración de cierre ordenado: detener HTTP, cancelar consumer, esperar handlers y cerrar RabbitMQ/Prisma en `apps/reports-service/test/contract/shutdown.contract.spec.ts`
- [ ] T079 Implementar shutdown completo y conectar señales del proceso en `apps/reports-service/src/infrastructure/lifecycle/graceful-shutdown.ts` y `apps/reports-service/src/main.ts` (depends on T065, T078)
- [ ] T080 Crear validador automatizado de OpenAPI y JSON Schema y conectarlo al script `openapi:reports:check` en `scripts/validate-reports-contracts.mjs` y `package.json` (depends on T017, T025)
- [ ] T081 Crear E2E Gateway → Reports → PostgreSQL/RabbitMQ para OWNER/ADMIN, resumen, ocupación e ingresos en `apps/reports-service/test/e2e/gateway-reports.e2e-spec.ts` (depends on T047, T074)
- [ ] T082 Ejecutar el quickstart en Docker Compose y registrar migración, contratos, suites, cobertura >=70 %, p95, health, DLQ y limitaciones reales en `specs/004-inventario-reportes-recomendaciones-cierre/reports_service/verification.md` (depends on T076, T077, T079, T080, T081)
- [ ] T083 Realizar revisión humana de trazabilidad RQ-12, constitución, ausencia de RQ-13/frontend y estado de la dependencia Accommodations en `specs/004-inventario-reportes-recomendaciones-cierre/reports_service/verification.md` (depends on T082)

**Checkpoint final**: solo se marca RQ-12 completamente integrado si T047 y T081 usan un productor real de habitaciones; con fixtures únicamente se informa la cobertura parcial.

---

## Dependencies & Execution Order

### Grafo de fases

```text
Phase 1 Setup
   └── Phase 2 Foundation
         ├── US1 Summary (MVP sobre proyección sembrada)
         ├── US2 Occupancy ── external gate: Accommodations
         ├── US3 Revenue
         └── US4 Reliable projection
                └── Phase 7 Gateway + Compose + RNF + E2E

US2 handlers ─┐
US3 handlers ─┼──> US4 event router/consumer
US1 summary <─┴── US2/US3 replace seeded metrics with real projections
```

### Dependencias por historia

- **US1** depende de Phase 2; se demuestra de forma independiente con datos sembrados.
- **US2** depende de Phase 2 y puede avanzar en paralelo con US1/US3; integración completa depende externamente del evento de Accommodations.
- **US3** depende de Phase 2 y puede avanzar en paralelo con US1/US2.
- **US4** puede comenzar sus pruebas después de Phase 2, pero su router final depende de los handlers de US2 y US3.
- **Phase 7** depende de las historias que se vayan a entregar; el E2E completo depende de las cuatro y del productor real de habitaciones.

### Oportunidades reales de paralelización

- T002, T004, T005, T007 y T008 pueden distribuirse después de T001 cuando no toquen el mismo archivo.
- En Foundation pueden avanzar en paralelo las líneas de persistencia (T011–T014), contratos/eventos (T016–T019), seguridad (T020–T021), HTTP (T022/T025–T026) y salud (T023–T024).
- Después de Foundation, un desarrollador puede llevar US1, otro US2 y otro US3; US4 comienza por tests/UoW y converge cuando existan los handlers.
- T070, T075, T077 y T078 pueden avanzar en paralelo antes de la integración final.

## Ejemplos de ejecución paralela

### US1

```text
T028 dominio/periodo || T029 contrato HTTP || T030 consulta PostgreSQL || T031 seguridad
T032 objetos de valor || T035 DTO/presenter
```

### US2

```text
T038 fórmula || T039 contrato HTTP || T040 SQL/intervalos || T041 proyección de eventos
T042 dominio || T043 handlers
```

### US3

```text
T048 dinero || T049 contrato HTTP || T050 integración DB || T051 contrato provider
```

### US4

```text
T057 outcomes/backoff || T058 UoW || T059 RabbitMQ || T060 concurrencia
```

## Implementation Strategy

### MVP demostrable

1. Completar Setup y Foundation.
2. Completar US1.
3. Validar el resumen con proyección sembrada y autorización real.
4. No declarar todavía cumplimiento completo de RQ-12.

### Entrega incremental

1. US1: contrato y resumen base.
2. US2: ocupación correcta y gate del inventario.
3. US3: ingresos reales por moneda.
4. US4: consumo robusto y replay.
5. Phase 7: Gateway, Compose, rendimiento, E2E y evidencia.

### Corte por tiempo

- Nunca eliminar idempotencia, autorización, validación o denominador correcto para cumplir las 16 horas estimadas.
- Si el tiempo no alcanza, reducir primero granularidades adicionales y hardening no bloqueante, dejando tareas abiertas y evidencia explícita.
- No introducir Redis, vistas materializadas, PDF/Excel, ML, RQ-13 ni frontend sin nueva evidencia o aprobación.

## Validación del formato

- Total esperado: **83 tareas** (`T001`–`T083`).
- Todas usan checkbox, ID secuencial, etiqueta de historia cuando aplica y ruta concreta.
- `[P]` solo marca trabajo en archivos diferentes sin dependencia incompleta.
- Cada historia incluye criterio de prueba independiente y pruebas antes de implementación.
