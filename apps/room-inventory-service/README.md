# Room Inventory Service (Sprint 4)

Productos y servicios disponibles en cada habitación. Puerto interno **3008**, PostgreSQL propio `inventory_db`.
Spec, plan, contratos y tareas: `specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/`.
Trazabilidad: entregable y criterio de aceptación de inventario del Sprint 4 ("el inventario de habitaciones se
actualiza correctamente"); no tiene RQ propio.

## Límites del dominio

- Inventory controla **items** (`PRODUCT` | `SERVICE`), su nombre, cantidad disponible (0..1 000 000) y estado activo.
- **Accommodations** es la autoridad de habitación, propiedad y dueño. Inventory guarda solo referencias opacas
  (`room_id`, `property_id`, `owner_id`) y nunca lee su base.
- **Bookings** sigue controlando la disponibilidad por fechas. No hay reservas de servicios, precios, cargos,
  pagos, stock mínimo, inventario por propiedad, RabbitMQ ni Redis.

## Arquitectura

| Capa | Contenido |
|---|---|
| `src/domain` | `InventoryItem` (normalización de nombre, tipo, cantidad, activo), `RoomInventory` (vacío = versión 0, máx. 200 items, orden estable), errores. |
| `src/application` | `GetRoomInventoryUseCase`, política `assertCanManageRoom` (OWNER propio, ADMIN cualquiera), puertos de repositorio, contexto de habitación y reloj. |
| `src/infrastructure` | Configuración `INVENTORY_*`, Prisma, cliente REST de Accommodations con timeout y circuit breaker, JWT entrante y saliente, logs redactados, métricas, OTel. |
| `src/interfaces` | Controller, DTO cerrados, guards, Problem Details, Swagger. Sin reglas de inventario. |

## Estado (Iteración 1: 40 de 80 tareas)

| Disponible | Pendiente |
|---|---|
| `GET /inventory/rooms/{roomId}` | `POST .../items` (US2) y `PUT` versionado (US3) |
| Migración, salud, Swagger, Compose, CI | Shutdown completo, rendimiento p95, E2E Docker (US4) |
| Cliente Accommodations probado contra stub + contrato | Endpoint provider en Accommodations (T025–T027) |
| Validador de contratos `openapi:inventory:check` | Proxy en API Gateway (T070–T073) |

**Dependencia externa**: Accommodations todavía no expone `GET /internal/v1/rooms/{roomId}/inventory-context` y su
verificador acepta un único emisor de servicio (Bookings). Hasta T025–T027, toda lectura real responde **503**
(nunca se sirven datos locales como autorizados) y el ownership distribuido no se declara integrado.

## Endpoints

| Método | Ruta | Respuestas |
|---|---|---|
| GET | `/inventory/rooms/{roomId}` | 200 (vacía: `version=0`, `items=[]`, timestamps `null`), 400, 401, 403, 404, 503 |
| GET | `/health/live`, `/health/ready` | `ready`; `degraded` si Accommodations falla; 503 `not_ready` sin PostgreSQL |
| GET | `/docs`, `/docs-json` | Swagger |

- **Entrada**: JWT delegado del Gateway, RS256, `aud=stayhub-room-inventory-service`, `scope=inventory:manage`,
  `sub` y `role`. Las cabeceras `x-user-id`, `x-role`, etc. se ignoran.
- **Salida hacia Accommodations**: token RS256 firmado en cada llamada con la clave propia de Inventory (`kid`
  `room-inventory-accommodations-2026-01`, vida 60 s, `scope=accommodations:inventory-context`). Nunca usa el scope
  de Booking Quote.
- **Errores**: `application/problem+json` con `code` y `traceId`. 404 de Accommodations → `ROOM_NOT_FOUND`;
  cualquier otro fallo (400/401/403/5xx, timeout, circuito abierto, respuesta fuera de contrato) → 503.

## Comandos (desde la raíz)

```powershell
npm run prisma:inventory:validate
npm run prisma:inventory:generate
npm run prisma:inventory:migrate:deploy     # requiere INVENTORY_DATABASE_URL(_FILE)
npm run lint:inventory
npm run typecheck:inventory
npm run test:inventory:unit
npm run test:inventory:contract
npm run test:inventory:security
npm run test:inventory:integration          # requiere INVENTORY_TEST_DATABASE_URL (si falta, se omiten)
npm run test:inventory:coverage
npm run openapi:inventory:check
npm run build:inventory
```

PostgreSQL 16 desechable para las pruebas de integración:

```powershell
docker container create --name stayhub-inventory-test-db -e POSTGRES_DB=inventory_test -e POSTGRES_USER=inventory_test `
  -e POSTGRES_PASSWORD=inventory_test -p 127.0.0.1:55437:5432 postgres:16-alpine
docker container start stayhub-inventory-test-db
$env:INVENTORY_DATABASE_URL = 'postgresql://inventory_test:inventory_test@127.0.0.1:55437/inventory_test?schema=public'
$env:INVENTORY_TEST_DATABASE_URL = $env:INVENTORY_DATABASE_URL
npm run prisma:inventory:migrate:deploy
npm run test:inventory:integration
```

Docker Compose (`docker-compose.yml`): `npm run env:compose:dev` genera `secrets/inventory-*.txt`, la clave
`secrets/room-inventory-service-*.pem` y las variables `INVENTORY_*`; luego
`docker compose up -d --build inventory-db room-inventory-migrate room-inventory-service`.

## Variables

Ver `apps/room-inventory-service/.env.example`. Secretos con variante `_FILE` (gana sobre la plana):
`INVENTORY_DATABASE_URL`, `INVENTORY_JWT_PUBLIC_KEYS_JSON`, `INVENTORY_SERVICE_PRIVATE_KEY`. Cualquier valor
inválido o ausente detiene el arranque; los límites (200 items, 1 000 000 unidades) solo pueden reducirse.

## Privacidad y logs

No se guardan datos de huéspedes, usuarios, pagos ni reservas. Las respuestas no exponen `ownerId`. Los logs
redactan JWT, claves PEM, credenciales en URLs, cuerpos y nombres de items.
