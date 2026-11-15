---
description: "Tareas ejecutables para implementar room-inventory-service del Sprint 4"
---

# Tasks: Room Inventory Service de StayHub

**Input**: documentos en `specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/`  
**Trazabilidad**: entregable y criterio de aceptación de inventario del Sprint 4; no RQ-12/RQ-13  
**Alcance**: backend, contrato Accommodations e integración Gateway; sin frontend, RabbitMQ, Redis, reservas, pagos o inventario por propiedad.

## Formato y reglas

- **[P]**: trabajo paralelizable en archivos distintos y después de satisfacer sus dependencias explícitas.
- **[US1]…[US4]**: historia de usuario de `spec.md`.
- Las pruebas de cada historia se escriben primero y deben fallar antes de implementar el comportamiento.
- “Coordinación externa” identifica cambios mínimos en Accommodations/Gateway; no autoriza ampliar esos dominios.

## Alcance de esta iteración (Iteración 1)

Se implementan **40 de 80 tareas**: las que son base o requisito de las demás, sin tocar otros microservicios.

| Bloque | Tareas | Motivo |
|---|---|---|
| Setup | T001–T008 | Workspace, Docker, Compose, CI y README: requisito de todo. |
| Fundamentos | T009–T024, T028–T030 | Configuración, Prisma/migración, puertos, HTTP común, OpenAPI, JWT entrante, cliente Accommodations contra stub/contrato, token saliente, salud y bootstrap. Bloquean todas las historias. |
| US1 | T031–T041 | Dominio `InventoryItem`/`RoomInventory`, repositorio, `GET` y módulo: base que reutilizan US2 y US3. |
| Prerrequisitos de cierre | T064, T075 | Dataset de 200 items (lo usa T068) y validador de los dos OpenAPI `openapi:inventory:check` (lo usa T078). Solo dependen de tareas de esta iteración. |

**Fuera de esta iteración**:
- Coordinación externa (no se modifican Accommodations ni Gateway): T025–T027 y T070–T073.
- Iteración 2: US2 (T042–T050), US3 (T051–T060), US4 (T061–T063, T065–T069) y cierre (T074, T076–T080).

**Límite honesto**: sin T025–T027 el contexto de habitación solo se valida contra el stub y el contrato; el ownership distribuido no se declara integrado.

**Ejecución con speckit-implement**: procesar solo las tareas de la Iteración 1; no marcar `[X]` ninguna otra.

---

## Phase 1: Setup del microservicio

**Purpose**: registrar el workspace NestJS y la infraestructura básica sin lógica funcional.

- [X] T001 Crear `@stayhub/room-inventory-service` con Node 20, NestJS 10.4.22, TypeScript 5.7.3, Prisma 6.19, JOSE, Swagger, OpenTelemetry, Jest y Supertest en `apps/room-inventory-service/package.json`
- [X] T002 [P] Configurar TypeScript estricto, build, aliases, ESLint y Jest por proyectos `unit|integration|contract|security|performance|e2e` en `apps/room-inventory-service/tsconfig.json`, `apps/room-inventory-service/tsconfig.build.json`, `apps/room-inventory-service/eslint.config.mjs` y `apps/room-inventory-service/jest.config.ts`
- [X] T003 Registrar workspace y scripts `build|lint|typecheck|test|coverage|prisma|openapi` sin alterar los existentes en `package.json` (depends on T001)
- [X] T004 [P] Definir variables `INVENTORY_*`, ejemplos locales no secretos y variantes `_FILE` en `apps/room-inventory-service/.env.example`
- [X] T005 [P] Crear Dockerfile multi-stage Node 20 con targets migration/runtime, usuario no-root y soporte read-only en `infra/docker/room-inventory/Dockerfile` y `infra/docker/room-inventory/Dockerfile.dockerignore`
- [X] T006 Incorporar `inventory-db`, `room-inventory-migrate` y `room-inventory-service` con puerto 3008, redes `inventory-internal`/`services`, secrets, health y `restart: unless-stopped` en `docker-compose.yml` y secretos locales en `scripts/generate-compose-dev-env.mjs` (depends on T005)
- [X] T007 [P] Añadir gates de Inventory sin eliminar los demás servicios en `.github/workflows/ci.yml`
- [X] T008 [P] Documentar límites del dominio, comandos reales, variables, contratos y dependencia Accommodations en `apps/room-inventory-service/README.md`

**Checkpoint**: workspace instalable y declarado en Compose/CI.

---

## Phase 2: Fundamentos bloqueantes

**Purpose**: configuración, persistencia, contratos, seguridad y contexto autoritativo requeridos por todas las historias.

**CRITICAL**: ninguna historia empieza antes de completar esta fase.

- [X] T009 [P] Crear pruebas fallidas de puerto 3008, URLs, `_FILE`, claves JWT, timeout, límites 200/1 000 000 y configuración fail-closed en `apps/room-inventory-service/test/unit/inventory-config.spec.ts`
- [X] T010 Implementar carga tipada y validación fail-fast de `INVENTORY_*` en `apps/room-inventory-service/src/infrastructure/config/inventory-config.ts` y `apps/room-inventory-service/src/infrastructure/config/config.module.ts` (depends on T009)
- [X] T011 Modelar `RoomInventory` con `roomId UUID PK`, `propertyId/ownerId UUID required`, `version >= 1`, timestamps; e `InventoryItem` con `id UUID PK`, FK local, `type PRODUCT|SERVICE`, `name VARCHAR(120) trim 1..120`, `quantityAvailable 0..1 000 000`, `active default true`, timestamps y sin FK remota en `apps/room-inventory-service/prisma/schema.prisma`
- [X] T012 Crear migración con checks, FK local e índices `(owner_id,updated_at)`, `(room_id,active)` y `(room_id,type)` en `apps/room-inventory-service/prisma/migrations/001_room_inventory/migration.sql` (depends on T011)
- [X] T013 [P] Crear prueba de migración desde PostgreSQL 16 vacío, constraints e inexistencia de FK hacia Accommodations en `apps/room-inventory-service/test/integration/migrations-health.spec.ts` (depends on T012)
- [X] T014 Implementar conexión Prisma, mapeo seguro de errores y cierre de pool en `apps/room-inventory-service/src/infrastructure/persistence/prisma/prisma.service.ts`, `apps/room-inventory-service/src/infrastructure/persistence/prisma/prisma.module.ts` y `apps/room-inventory-service/src/infrastructure/persistence/prisma/database-error.ts` (depends on T011)
- [X] T015 [P] Definir errores de dominio y puertos de repositorio, contexto de habitación y reloj sin imports de NestJS/Prisma en `apps/room-inventory-service/src/domain/inventory-errors.ts`, `apps/room-inventory-service/src/application/ports/inventory.repository.ts`, `apps/room-inventory-service/src/application/ports/room-context.port.ts` y `apps/room-inventory-service/src/application/ports/clock.port.ts`
- [X] T016 [P] Implementar ValidationPipe `whitelist + forbidNonWhitelisted`, Problem Details y trace interceptor en `apps/room-inventory-service/src/interfaces/http/validation.pipe.ts`, `apps/room-inventory-service/src/interfaces/http/problem.filter.ts` y `apps/room-inventory-service/src/interfaces/http/trace.interceptor.ts`
- [X] T017 [P] Crear prueba de drift que valide las tres operaciones, errores y schemas del OpenAPI público en `apps/room-inventory-service/test/contract/openapi-drift.spec.ts`
- [X] T018 Implementar factory Swagger y documentación sincronizada con `openapi-room-inventory.yaml` en `apps/room-inventory-service/src/interfaces/openapi/openapi.factory.ts` y `apps/room-inventory-service/src/interfaces/openapi/inventory.openapi.ts` (depends on T017)
- [X] T019 [P] Crear pruebas fallidas de JWT delegado RS256: issuer, `kid`, audience `stayhub-room-inventory-service`, scope `inventory:manage`, `sub`, role, expiración y headers suplantados en `apps/room-inventory-service/test/security/service-auth.spec.ts`
- [X] T020 Implementar principal, verificador y guard de token delegado sin confiar en `x-user-id`/`x-role` en `apps/room-inventory-service/src/infrastructure/security/inventory-principal.ts`, `apps/room-inventory-service/src/infrastructure/security/service-jwt.verifier.ts` y `apps/room-inventory-service/src/interfaces/http/guards/service-auth.guard.ts` (depends on T019)
- [X] T021 [P] Crear fixture/stub cerrado del contexto `roomId,propertyId,ownerId,propertyStatus,roomExists=true` y casos 401/404/503 en `apps/room-inventory-service/test/fixtures/accommodations-context.fixture.ts`
- [X] T022 [P] Crear prueba consumer del contrato `accommodations-inventory-context.openapi.yaml`, validación de respuesta y mapeo de errores/timeout en `apps/room-inventory-service/test/contract/accommodations-context.consumer.spec.ts` (depends on T021)
- [X] T023 [P] Crear pruebas unitarias de token saliente RS256 firmado con la clave propia de Inventory (`kid`/issuer `stayhub-room-inventory-service`), vida <= 60 s, subject `stayhub-room-inventory-service`, audience de Accommodations y scope exacto `accommodations:inventory-context` en `apps/room-inventory-service/test/unit/outbound-service-token.spec.ts`
- [X] T024 Implementar proveedor de token, cliente REST con timeout/circuito y mapper de Problem Details en `apps/room-inventory-service/src/infrastructure/security/outbound-service-token.provider.ts`, `apps/room-inventory-service/src/infrastructure/http/accommodations-room-context.client.ts` y `apps/room-inventory-service/src/infrastructure/http/remote-problem.mapper.ts` (depends on T022, T023)
- [ ] T025 [P] [Coordinación externa: Accommodations] Crear pruebas provider para `/internal/v1/rooms/{roomId}/inventory-context`, 404 indistinguible y scope separado en `apps/accommodations-service/test/contract/inventory-context.contract.spec.ts`
- [ ] T026 [Coordinación externa: Accommodations] Implementar caso de uso/controller de contexto mínimo y autorización `accommodations:inventory-context` sin exponer nombres/precios en `apps/accommodations-service/src/application/properties/get-inventory-context.use-case.ts`, `apps/accommodations-service/src/interfaces/http/internal/inventory-context.controller.ts` y `apps/accommodations-service/src/modules/properties/properties.module.ts` (depends on T025)
- [ ] T027 [Coordinación externa: Accommodations] Extender configuración/guard a varios llamantes de confianza (issuer + kid + clave por llamante; hoy solo acepta Bookings) y a scopes por endpoint, preservando `accommodations:booking-quote` en `apps/accommodations-service/src/infrastructure/config/accommodations-config.ts`, `apps/accommodations-service/src/interfaces/http/auth/service-auth.guard.ts` y `apps/accommodations-service/test/contract/booking-quote.contract.spec.ts` (depends on T025)
- [X] T028 [P] Crear pruebas de health, logging redactado y métricas base sin JWT/body/nombre de item en `apps/room-inventory-service/test/integration/health-observability.spec.ts`
- [X] T029 Implementar logger, métricas y health modules para proceso/PostgreSQL/Accommodations en `apps/room-inventory-service/src/infrastructure/observability/inventory-logger.ts`, `apps/room-inventory-service/src/infrastructure/observability/inventory-metrics.ts`, `apps/room-inventory-service/src/modules/health/health.controller.ts` y `apps/room-inventory-service/src/modules/health/health.module.ts` (depends on T028)
- [X] T030 Ensamblar configuración, Prisma, HTTP común, seguridad, Swagger y salud en `apps/room-inventory-service/src/main.ts` y `apps/room-inventory-service/src/app.module.ts` (depends on T010, T014, T016, T018, T020, T024, T029)

**Checkpoint**: servicio arranca, migra, autentica y puede resolver contexto de habitación; aún no expone inventario.

---

## Phase 3: US1 — Consultar inventario de una habitación (P1)

**Goal**: entregar `GET /inventory/rooms/{roomId}` con ownership real y respuesta vacía `version=0` cuando corresponda.

**Independent Test**: una habitación propia sin fila local devuelve 200/versión 0/items vacíos; una con inventario devuelve items; OWNER ajeno recibe 403 y habitación inexistente 404.

### Pruebas primero

- [X] T031 [P] [US1] Crear pruebas unitarias del agregado vacío, mapeo de contexto y autorización OWNER/ADMIN/GUEST en `apps/room-inventory-service/test/unit/get-room-inventory.use-case.spec.ts`
- [X] T032 [P] [US1] Crear prueba contractual de `GET /inventory/rooms/{roomId}` para 200/400/401/403/404/503 y ausencia de PII en `apps/room-inventory-service/test/contract/get-room-inventory.contract.spec.ts`
- [X] T033 [P] [US1] Crear prueba PostgreSQL para lectura por PK, orden estable, items activos/inactivos y snapshot mínimo owner/property en `apps/room-inventory-service/test/integration/get-room-inventory.spec.ts`
- [X] T034 [P] [US1] Crear prueba de seguridad OWNER propio/ajeno, ADMIN, GUEST y Accommodations caído en `apps/room-inventory-service/test/security/get-room-inventory-access.spec.ts`

### Implementación

- [X] T035 [P] [US1] Implementar `InventoryItem` con enum `PRODUCT|SERVICE`, nombre trim 1..120, cantidad 0..1 000 000 y estado activo en `apps/room-inventory-service/src/domain/inventory-item.ts`
- [X] T036 [P] [US1] Implementar `RoomInventory` vacío version 0 y persistido version >=1, máximo 200 items y referencias opacas en `apps/room-inventory-service/src/domain/room-inventory.ts`
- [X] T037 [US1] Implementar lectura Prisma y mapeo dominio/persistencia sin joins remotos en `apps/room-inventory-service/src/infrastructure/persistence/prisma/prisma-inventory.repository.ts` (depends on T033, T035, T036)
- [X] T038 [US1] Implementar `GetRoomInventoryUseCase`: resolver contexto, validar ownership y sintetizar vacío sin persistirlo en `apps/room-inventory-service/src/application/use-cases/get-room-inventory.use-case.ts` (depends on T024, T031, T037)
- [X] T039 [P] [US1] Implementar DTO de path y presenter con `createdAt/updatedAt=null` para versión 0, sin ownerId en respuesta en `apps/room-inventory-service/src/interfaces/http/inventory/inventory.dto.ts` y `apps/room-inventory-service/src/interfaces/http/inventory/inventory.presenter.ts` (depends on T032)
- [X] T040 [US1] Implementar `GET /inventory/rooms/:roomId` y mapeo Problem Details en `apps/room-inventory-service/src/interfaces/http/inventory/inventory.controller.ts` (depends on T038, T039)
- [X] T041 [US1] Registrar repositorio, cliente, caso de uso, controller y guards en `apps/room-inventory-service/src/modules/inventory.module.ts` y `apps/room-inventory-service/src/app.module.ts` (depends on T040)

**Checkpoint**: US1 funciona de extremo a extremo con Accommodations y PostgreSQL, sin capacidad de escritura todavía.

---

## Phase 4: US2 — Agregar producto o servicio (P1) 🎯 MVP funcional

**Goal**: agregar un item transaccional mediante `POST /inventory/rooms/{roomId}/items`.

**Independent Test**: agregar PRODUCT/SERVICE válido crea UUID, aumenta versión una vez y persiste; cantidad/tipo/nombre inválidos o item 201 no dejan escritura parcial.

### Pruebas primero

- [ ] T042 [P] [US2] Crear pruebas unitarias de creación, UUID, normalización, límites y versión 0→1/N→N+1 en `apps/room-inventory-service/test/unit/add-inventory-item.use-case.spec.ts`
- [ ] T043 [P] [US2] Crear prueba contractual de `POST /inventory/rooms/{roomId}/items` con body cerrado y respuestas 201/400/401/403/404/422/503 en `apps/room-inventory-service/test/contract/add-inventory-item.contract.spec.ts`
- [ ] T044 [P] [US2] Crear integración PostgreSQL para create agregado, append atómico, item 201, rollback y actualización de snapshot owner/property en `apps/room-inventory-service/test/integration/add-inventory-item.spec.ts`
- [ ] T045 [P] [US2] Crear prueba de seguridad para OWNER ajeno, ADMIN, GUEST, headers suplantados e inputs extra/maliciosos en `apps/room-inventory-service/test/security/add-inventory-item-access.spec.ts`

### Implementación

- [ ] T046 [US2] Implementar transacción Prisma `addItem` con límite 200, UUID y aumento exacto de versión en `apps/room-inventory-service/src/infrastructure/persistence/prisma/prisma-inventory.repository.ts` (depends on T044)
- [ ] T047 [US2] Implementar `AddInventoryItemUseCase` con contexto autoritativo, ownership y validación previa a transacción en `apps/room-inventory-service/src/application/use-cases/add-inventory-item.use-case.ts` (depends on T042, T046)
- [ ] T048 [P] [US2] Añadir DTO `type|name|quantityAvailable|active` con allowlist y límites exactos al contrato en `apps/room-inventory-service/src/interfaces/http/inventory/inventory.dto.ts` (depends on T043)
- [ ] T049 [US2] Implementar `POST /inventory/rooms/:roomId/items`, status 201 y presenter común en `apps/room-inventory-service/src/interfaces/http/inventory/inventory.controller.ts` (depends on T047, T048)
- [ ] T050 [US2] Registrar el caso de uso de creación y verificar regresión de GET después del POST en `apps/room-inventory-service/src/modules/inventory.module.ts` y `apps/room-inventory-service/test/integration/get-room-inventory.spec.ts` (depends on T049)

**Checkpoint**: US1+US2 forman el MVP funcional que consulta y actualiza inventario conforme al criterio del Sprint 4.

---

## Phase 5: US3 — Reemplazar inventario completo (P1)

**Goal**: reemplazar el agregado con `expectedVersion`, replay idempotente, soft-deactivate y conflictos 409.

**Independent Test**: PUT válido cambia el estado y aumenta una versión; replay idéntico no incrementa; omisión desactiva; ID desconocido revierte; dos escritores con la misma versión producen un ganador y un 409.

### Pruebas primero

- [ ] T051 [P] [US3] Crear pruebas unitarias de colección completa, IDs conocidos, omisión→inactive, no-op, replay y conflicto de versión en `apps/room-inventory-service/test/unit/replace-room-inventory.use-case.spec.ts`
- [ ] T052 [P] [US3] Crear prueba contractual de `PUT /inventory/rooms/{roomId}` con `expectedVersion`, máximo 200 items y respuestas 200/400/401/403/404/409/422/503 en `apps/room-inventory-service/test/contract/replace-room-inventory.contract.spec.ts`
- [ ] T053 [P] [US3] Crear integración PostgreSQL de replace atómico, soft-deactivate, no-op/replay e ID desconocido con rollback en `apps/room-inventory-service/test/integration/replace-room-inventory.spec.ts`
- [ ] T054 [P] [US3] Crear prueba concurrente con dos PUT sobre la misma versión y demostrar una sola actualización en `apps/room-inventory-service/test/integration/inventory-concurrency.spec.ts`
- [ ] T055 [P] [US3] Crear prueba de seguridad de reemplazo para ownership, campos extra, UUID duplicado y payload >200 en `apps/room-inventory-service/test/security/replace-room-inventory-access.spec.ts`

### Implementación

- [ ] T056 [US3] Implementar comparación normalizada y transición de reemplazo/no-op en `apps/room-inventory-service/src/domain/room-inventory.ts` (depends on T051)
- [ ] T057 [US3] Implementar `replace` Prisma con `UPDATE ... WHERE version=expectedVersion`, transacción serializable y soft-deactivate sin hard delete en `apps/room-inventory-service/src/infrastructure/persistence/prisma/prisma-inventory.repository.ts` (depends on T053, T054, T056)
- [ ] T058 [US3] Implementar `ReplaceRoomInventoryUseCase`, replay de estado ya aplicado y 409 solo para estado divergente en `apps/room-inventory-service/src/application/use-cases/replace-room-inventory.use-case.ts` (depends on T057)
- [ ] T059 [P] [US3] Añadir DTO `expectedVersion>=0` e items con `id,type,name,quantityAvailable,active`, IDs únicos y máximo 200 en `apps/room-inventory-service/src/interfaces/http/inventory/inventory.dto.ts` (depends on T052)
- [ ] T060 [US3] Implementar `PUT /inventory/rooms/:roomId` y registrar el caso de uso en `apps/room-inventory-service/src/interfaces/http/inventory/inventory.controller.ts` y `apps/room-inventory-service/src/modules/inventory.module.ts` (depends on T058, T059)

**Checkpoint**: las tres operaciones públicas están completas y las escrituras concurrentes son seguras.

---

## Phase 6: US4 — Operación segura y portable (P2)

**Goal**: completar salud, observabilidad, rendimiento, Docker y cierre ordenado del servicio.

**Independent Test**: Compose levanta DB/migración/servicio, health distingue fallos, logs no filtran datos, GET con 200 items cumple p95 y shutdown cierra solicitudes/Prisma.

### Pruebas primero

- [ ] T061 [P] [US4] Crear prueba contractual de liveness/readiness para DB sana/caída y Accommodations degradado en `apps/room-inventory-service/test/contract/health.contract.spec.ts`
- [ ] T062 [P] [US4] Crear prueba de métricas/trazas/logs redactados para GET/POST/PUT, 409 y dependencia remota en `apps/room-inventory-service/test/integration/observability.spec.ts`
- [ ] T063 [P] [US4] Crear prueba contractual de shutdown: dejar de aceptar HTTP, esperar solicitudes y cerrar Prisma en `apps/room-inventory-service/test/contract/shutdown.contract.spec.ts`
- [X] T064 [P] [US4] Crear dataset reproducible de 200 items y OWNER/ADMIN para rendimiento en `apps/room-inventory-service/test/fixtures/performance-dataset.ts`

### Implementación

- [ ] T065 [US4] Completar readiness/liveness con códigos seguros y estado de Accommodations en `apps/room-inventory-service/src/modules/health/health.controller.ts` (depends on T061)
- [ ] T066 [US4] Instrumentar duración HTTP/DB, conflictos, conteo de items y latencia/circuito remoto sin nombres/body en `apps/room-inventory-service/src/infrastructure/observability/inventory-metrics.ts`, `apps/room-inventory-service/src/infrastructure/observability/inventory-logger.ts` y `apps/room-inventory-service/src/infrastructure/observability/otel.ts` (depends on T062)
- [ ] T067 [US4] Implementar shutdown ordenado y señales del proceso en `apps/room-inventory-service/src/infrastructure/lifecycle/graceful-shutdown.ts` y `apps/room-inventory-service/src/main.ts` (depends on T063)
- [ ] T068 [US4] Crear prueba de rendimiento GET con p95 <500 ms y error <1 %, registrando plan de consulta antes de cualquier caché en `apps/room-inventory-service/test/performance/inventory-performance.spec.ts` (depends on T037, T064)
- [ ] T069 [US4] Verificar imagen no-root/read-only, migración separada, health y reinicio en `apps/room-inventory-service/test/e2e/docker-runtime.e2e-spec.ts` (depends on T005, T006, T065, T067)

**Checkpoint**: Inventory es operable como servicio independiente y cumple los RNF aplicables.

---

## Phase 7: Integración Gateway, E2E y cierre

**Purpose**: publicar las APIs, validar el flujo distribuido real y dejar evidencia honesta.

- [ ] T070 [P] [Coordinación externa: Gateway] Crear pruebas Gateway → stub Inventory para rutas, body/header allowlist, timeout/circuito, Problem Details y JWT delegado en `apps/api-gateway/test/integration/inventory-proxy.spec.ts`
- [ ] T071 [Coordinación externa: Gateway] Implementar cliente Inventory reutilizando cliente base, audience `stayhub-room-inventory-service` y scope `inventory:manage` en `apps/api-gateway/src/infrastructure/http/room-inventory.client.ts` (depends on T070)
- [ ] T072 [Coordinación externa: Gateway] Implementar proxy delgado y Swagger de las tres rutas, sin ownership ni reglas de inventario, en `apps/api-gateway/src/modules/inventory/inventory.controller.ts`, `apps/api-gateway/src/modules/inventory/inventory-proxy.module.ts` y `apps/api-gateway/src/modules/inventory/inventory.openapi.ts` (depends on T071)
- [ ] T073 [Coordinación externa: Gateway] Registrar URL, timeout, audience/scope y módulo Inventory sin romper módulos existentes en `apps/api-gateway/src/infrastructure/config/gateway-config.ts` y `apps/api-gateway/src/app.module.ts` (depends on T072)
- [ ] T074 Integrar variables/secrets, redes, startup order y health de Gateway/Inventory/Accommodations/PostgreSQL en `docker-compose.yml` y `scripts/generate-compose-dev-env.mjs` (depends on T026, T027, T060, T073)
- [X] T075 [P] Crear validador automatizado de los dos OpenAPI y conectarlo a `openapi:inventory:check` en `scripts/validate-room-inventory-contracts.mjs` y `package.json` (depends on T017, T022)
- [ ] T076 [P] Completar suite transversal de seguridad para JWT inválido, OWNER ajeno, GUEST, spoofed headers, inyección, body grande y logs sin secretos en `apps/room-inventory-service/test/security/inventory-security.spec.ts`
- [ ] T077 Crear E2E real Gateway → Inventory → Accommodations + PostgreSQL para GET vacío, POST, PUT, replay y 409 en `apps/room-inventory-service/test/e2e/gateway-room-inventory.e2e-spec.ts` (depends on T074)
- [ ] T078 Ejecutar lint, typecheck, build, contratos, suites y cobertura >=70 %, registrando resultados en `specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/verification.md` (depends on T068, T069, T075, T076, T077)
- [ ] T079 Ejecutar `quickstart.md` mediante Docker Compose y registrar p95, health, no-root, shutdown y provider Accommodations real en `specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/verification.md` (depends on T078)
- [ ] T080 Realizar revisión humana de trazabilidad al Sprint 4, regresión Booking Quote, ausencia de RQ-12/RQ-13, Redis/RabbitMQ/frontend y alcance no autorizado en `specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/verification.md` (depends on T079)

**Checkpoint final**: no se declara integración completa si Accommodations o Gateway solo fueron sustituidos por stubs.

---

## Dependencies & Execution Order

### Grafo de fases

```text
Phase 1 Setup
  └── Phase 2 Foundation
        ├── US1 GET
        │     └── US2 POST (MVP funcional)
        │             └── US3 PUT/versioning
        └── US4 operación puede avanzar en paralelo tras Foundation

Accommodations provider ─┐
Gateway proxy ───────────┼──> Phase 7 Compose + E2E + evidencia
US1 + US2 + US3 + US4 ──┘
```

### Dependencias por historia

- **US1** depende de Foundation y del contrato Accommodations; entrega lectura independiente.
- **US2** reutiliza agregado/repositorio/controller de US1 y completa el primer incremento que actualiza inventario.
- **US3** reutiliza el agregado y persistencia de US1/US2 para reemplazo versionado; no debe duplicar reglas.
- **US4** puede iniciar pruebas después de Foundation y converge con las rutas terminadas para métricas/performance.
- **Phase 7** depende de las historias entregadas y de los cambios coordinados en Accommodations/Gateway.

### Paralelización real

- Setup: T002, T004, T005, T007 y T008 después de T001 cuando no compartan archivos.
- Foundation: ramas DB (T011–T014), seguridad (T019–T020), contrato/client Accommodations (T021–T024), provider externo (T025–T027) y observabilidad (T028–T029).
- Después de Foundation: US1 es el primer corte; US4 puede avanzar en paralelo. US2 y US3 siguen secuencialmente para reutilizar el agregado sin conflictos.
- Phase 7: pruebas Gateway T070, validador T075 y seguridad T076 pueden comenzar en paralelo.

## Ejemplos paralelos

### US1

```text
T031 use case || T032 contrato || T033 PostgreSQL || T034 seguridad
T035 InventoryItem || T036 RoomInventory || T039 DTO/presenter
```

### US2

```text
T042 dominio || T043 contrato || T044 PostgreSQL || T045 seguridad
```

### US3

```text
T051 dominio || T052 contrato || T053 persistencia || T054 concurrencia || T055 seguridad
```

### US4

```text
T061 health || T062 observabilidad || T063 shutdown || T064 dataset
```

## Implementation Strategy

### MVP funcional recomendado

1. Completar Setup y Foundation.
2. Completar US1 para lectura segura.
3. Completar US2 para actualización real mediante POST.
4. Validar contra Accommodations real; detenerse y demostrar el incremento.

US1 sola es un corte técnico, pero US1+US2 es el mínimo que satisface “el inventario se actualiza correctamente”.

### Entrega incremental

1. US1: consulta y ownership.
2. US2: creación transaccional.
3. US3: reemplazo y concurrencia.
4. US4: operación/RNF.
5. Gateway, Compose, E2E y evidencia.

### Corte de tiempo

- Conservar siempre ownership, DTO cerrado, transacción, versión y contrato.
- Si las 10 horas no alcanzan, dejar abiertos performance/hardening/E2E con evidencia; no marcarlos completos con stubs.
- No agregar Redis, RabbitMQ, stock mínimo, precios, órdenes, pagos, disponibilidad de reservas ni frontend.

## Validación del formato

- Total esperado: **80 tareas** (`T001`–`T080`).
- Cada tarea usa checkbox, ID secuencial, etiqueta de historia cuando corresponde y ruta concreta.
- `[P]` solo aparece en trabajo separable por archivos después de sus dependencias.
- Cada historia declara prueba independiente y tiene pruebas antes de implementación.
