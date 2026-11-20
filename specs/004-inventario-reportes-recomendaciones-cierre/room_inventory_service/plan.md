# Implementation Plan: Room Inventory Service de StayHub

**Git branch actual**: `inventory_service`  
**Spec Kit feature context**: `room_inventory_service`  
**Fecha**: 2026-11-15  
**Spec**: `specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/spec.md`

**Input**: `tendencias.md`, constitución 1.0.0, código actual de Accommodations/API Gateway y convenciones de los microservicios implementados.

## Summary

Construir `room-inventory-service` como microservicio NestJS independiente en el puerto 3008 para consultar, agregar y reemplazar de forma versionada los productos y servicios disponibles en una habitación. Tendrá arquitectura hexagonal pragmática, PostgreSQL 16 propio y Prisma 6.19. Accommodations seguirá siendo la autoridad sobre propiedades, habitaciones y ownership; Inventory obtiene un contexto mínimo mediante REST interno autenticado y nunca accede a su base.

El incremento implementa únicamente los tres endpoints definidos en `tendencias.md`. No gestiona disponibilidad por fechas, reservas, características, precio de habitación, consumo del huésped, órdenes o pagos. No se utilizarán Redis ni RabbitMQ porque el flujo exige validación autoritativa inmediata y no existe un consumidor de eventos de inventario dentro del alcance.

### Trazabilidad

| Fuente | Responsabilidad de Inventory | Cobertura |
|---|---|---|
| Objetivo general | Inventario de habitaciones y servicios. | Productos/servicios por habitación. |
| Catálogo de servicios | Control de elementos disponibles. | `GET`, `PUT` y `POST .../items`. |
| Sprint 4 | `room-inventory-service` NestJS, 10 h estimadas. | MVP backend, integración y pruebas esenciales. |
| Criterio de aceptación | El inventario se actualiza correctamente. | Transacciones, versión optimista y pruebas de concurrencia. |
| RNF rendimiento | p95 < 500 ms en consultas. | Perfil reproducible de `GET`. |
| RNF seguridad | JWT, roles, sanitización y HTTPS en Gateway. | OWNER propio/ADMIN; JWT delegado. |
| RNF portabilidad | Docker Compose. | DB, migración, servicio y health checks. |

No se atribuye RQ-12 ni RQ-13: el documento no asigna un RQ numerado al inventario. La trazabilidad válida es el entregable y criterio explícitos del Sprint 4.

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.7.3 estricto  
**Primary Dependencies**: NestJS 10.4.22, Prisma/@prisma/client 6.19.0, class-validator 0.14.1, class-transformer 0.5.1, @nestjs/swagger 8.1.1, JOSE 5.9.6 y OpenTelemetry en versiones del monorepo (mismas que Bookings/Reviews)  
**Storage**: `inventory_db` PostgreSQL 16 exclusivo; sin Redis  
**Communication**: REST síncrono con API Gateway y Accommodations; sin RabbitMQ en el MVP  
**Testing**: Jest 29.7 (`unit|integration|contract|security|performance|e2e`), Supertest 7 y PostgreSQL 16 real  
**Target Platform**: contenedor Linux no-root, red interna de base y red de servicios  
**Project Type**: workspace npm `@stayhub/room-inventory-service` dentro del monorepo NestJS  
**Performance Goals**: p95 < 500 ms y error < 1 % para `GET` con hasta 200 items por habitación  
**Constraints**: puerto 3008; OWNER solo propio; ADMIN cualquiera; máximo 200 items; cantidad 0..1 000 000; transacción atómica; control optimista; sin DB compartida  
**Scale/Scope**: 3 endpoints, 2 entidades persistentes, 1 integración REST interna y 1 integración Gateway

No quedan decisiones técnicas abiertas dentro del alcance. Las decisiones y alternativas están registradas en `research.md`.

## Constitution Check

*Gate inicial y revisión post-diseño: PASS.*

| Principio | Cumplimiento | Estado |
|---|---|---|
| I. Dominio | Inventory posee catálogo/cantidades; no absorbe reservas ni alojamientos. | PASS |
| II. Capas | Dominio/aplicación dependen de puertos; HTTP, Prisma y JWT son adaptadores. | PASS |
| III. Datos | `inventory_db` propia; room/property/owner son referencias externas sin FK. | PASS |
| IV. Comunicación | REST interno documentado para verificación inmediata; no se añade mensajería sin consumidor real. | PASS |
| V. Seguridad | JWT delegado, roles y ownership en el servicio, DTO cerrado y logs redactados. | PASS |
| VI. Código | TypeScript estricto, módulos cohesivos y reglas en dominio. | PASS |
| VII. Contratos | OpenAPI público y contrato REST interno versionado. | PASS |
| VIII. Verificación | Trazabilidad al Sprint 4 y pruebas unitarias, integración, contrato, seguridad, concurrencia y E2E. | PASS |
| Docker | Imagen no-root, migración separada, Compose, health y shutdown. | PASS |

## Project Structure

### Documentación

```text
specs/004-inventario-reportes-recomendaciones-cierre/room_inventory_service/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi-room-inventory.yaml
│   └── accommodations-inventory-context.openapi.yaml
└── tasks.md                         # futuro: $speckit-tasks
```

### Código propuesto

```text
apps/room-inventory-service/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── jest.config.ts
├── eslint.config.mjs
├── .env.example
├── README.md
├── prisma/
│   ├── schema.prisma
│   └── migrations/001_room_inventory/migration.sql
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── domain/{inventory-item.ts,room-inventory.ts,inventory-errors.ts}
│   ├── application/
│   │   ├── ports/{inventory.repository.ts,room-context.port.ts,clock.port.ts}
│   │   └── use-cases/{get-room-inventory.use-case.ts,add-inventory-item.use-case.ts,replace-room-inventory.use-case.ts}
│   ├── infrastructure/
│   │   ├── config/{inventory-config.ts,config.module.ts}
│   │   ├── persistence/prisma/{prisma.service.ts,prisma.module.ts,prisma-inventory.repository.ts,database-error.ts}
│   │   ├── http/{accommodations-room-context.client.ts,remote-problem.mapper.ts}
│   │   ├── security/{service-jwt.verifier.ts,outbound-service-token.provider.ts,inventory-principal.ts}
│   │   ├── observability/{inventory-logger.ts,inventory-metrics.ts,otel.ts}
│   │   └── lifecycle/graceful-shutdown.ts
│   ├── interfaces/
│   │   ├── http/{configure-http.ts,problem.filter.ts,validation.pipe.ts,trace.interceptor.ts}
│   │   ├── http/inventory/{inventory.controller.ts,inventory.dto.ts,inventory.presenter.ts}
│   │   ├── http/guards/{service-auth.guard.ts,inventory-access.guard.ts}
│   │   └── openapi/{openapi.factory.ts,inventory.openapi.ts}
│   └── modules/{inventory.module.ts,health/}
└── test/{unit,integration,contract,security,performance,e2e,fixtures}/

infra/docker/room-inventory/Dockerfile
```

Registrar el workspace en `package.json`, CI, `.env.example`, `docker-compose.yml` (el stack que se ejecuta; `docker-compose.services.yml` es una variante aparte de Payments/Notifications y no se modifica), `scripts/generate-compose-dev-env.mjs` y API Gateway mediante tareas coordinadas.

**Structure Decision**: arquitectura hexagonal pragmática consistente con Accommodations, Search, Bookings y Payments: dominio puro, casos de uso con puertos, Prisma/HTTP/JWT como adaptadores y controladores delgados.

## Responsabilidad por capa

- **Domain**: tipos PRODUCT/SERVICE, límites de cantidad, activación, versión y reemplazo idempotente. No importa NestJS, Prisma ni HTTP.
- **Application**: valida actor y contexto de habitación, coordina repositorio y transacción, decide 404/409 y DTO de salida.
- **Infrastructure**: Prisma, cliente Accommodations, JWT entrante/saliente, configuración, health, logs y métricas.
- **Interfaces**: DTOs cerrados, guards, controller, presenter, Problem Details y Swagger; sin reglas de inventario.

## Contratos HTTP públicos

Las rutas internas del servicio se publican mediante Gateway bajo `/api/v1` y reciben JWT delegado con `aud=stayhub-room-inventory-service`, scope `inventory:manage`, `sub=userId` y `role`.

### `GET /inventory/rooms/{roomId}`

- OWNER propio o ADMIN.
- Valida contexto autoritativo. Si la habitación existe sin fila local, devuelve `200`, `version=0`, `items=[]`.
- Devuelve todos los items, incluidos inactivos, para administración.

### `POST /inventory/rooms/{roomId}/items`

- Body cerrado: `type`, `name`, `quantityAvailable`, `active`.
- Crea UUID, agrega el item y aumenta versión en una transacción.
- Devuelve 201 y el inventario resultante.

### `PUT /inventory/rooms/{roomId}`

- Body cerrado: `expectedVersion`, colección completa de máximo 200 items.
- Actualiza existentes; un ID desconocido produce 400. Los omitidos quedan `active=false` para conservar historial.
- Si la versión está atrasada pero el estado solicitado ya coincide con el actual, devuelve 200 sin incrementar; si difiere, 409.
- Si no hay cambios, mantiene la versión. Un cambio válido aumenta exactamente uno.

Errores comunes: 400 validación, 401 token, 403 rol/ownership, 404 habitación oculta/inexistente, 409 versión, 422 límite de dominio, 503 Accommodations/PostgreSQL no disponibles. Se usa `application/problem+json` con `code` y `traceId`.

## Contrato interno con Accommodations

Se requiere `GET /internal/v1/rooms/{roomId}/inventory-context`, protegido por service JWT con audience de Accommodations y scope `accommodations:inventory-context`. Respuesta mínima: `roomId`, `propertyId`, `ownerId`, `propertyStatus` y `roomExists=true`.

Inventory envía como sujeto de servicio `stayhub-room-inventory-service`; el contexto no expone nombres, precio, fotos ni dirección. Accommodations responde 404 indistinguible para room/property inexistente u oculta. Timeout corto, sin retry automático prolongado y circuito según el cliente base del repositorio.

Esta adición requiere coordinación con el equipo de Accommodations. Hasta verificarla contra el proveedor real, los tests con stub no prueban ownership distribuido completo.

El adaptador actual de Accommodations configura un único scope para Booking Quote. La implementación debe introducir autorización por scope/endpoint y conservar intacto `accommodations:booking-quote`; no se reemplaza su scope ni se permite que un token de Inventory consulte cotizaciones.

**Hallazgo de compatibilidad (verificado en el código)**: `accommodations-config.ts` y `service-jwt.verifier.ts` aceptan **un solo emisor de servicio** (un `ACCOMMODATIONS_SERVICE_JWT_ISSUER`, un `KID` y una clave pública, hoy los de Bookings) y rechazan tokens con `iat` de más de 300 s. Por eso:

- Inventory firma tokens salientes **propios y de vida corta** (≤ 60 s) con su clave privada (`INVENTORY_SERVICE_PRIVATE_KEY_FILE`, `kid` e issuer `stayhub-room-inventory-service`); no reutiliza la clave de Bookings ni tokens pregenerados de 30 días.
- Accommodations debe aceptar **varios llamantes de confianza** (issuer + kid + clave por llamante) además de scopes por endpoint. Ampliar solo el scope no basta. Esto forma parte de T027 (coordinación externa).

## Persistencia y reglas

- `RoomInventory`: PK `roomId`, referencias opacas `propertyId/ownerId`, `version >= 1` una vez persistido y timestamps.
- `InventoryItem`: UUID, FK local a `RoomInventory`, `type`, `name`, `quantityAvailable`, `active`, timestamps.
- No existe FK hacia Accommodations ni acceso a su esquema.
- `quantityAvailable=0` significa sin disponibilidad; `active=false` significa retirado administrativamente.
- Máximo 200 items por habitación; nombre normalizado para espacios, sin imponer unicidad no definida por producto.
- Escrituras con transacción e `UPDATE ... WHERE version=expectedVersion`; una actualización concurrente pierde con 409, nunca parcialmente.
- Eliminación física no forma parte del MVP.

## Seguridad

- Solo JWT delegado RS256 del Gateway; issuer, `kid`, audience, scope, `exp`, `iat`, `sub` y role obligatorios.
- OWNER requiere `context.ownerId == sub`; ADMIN puede administrar cualquier habitación; GUEST prohibido.
- Se ignoran/rechazan `x-user-id`, `x-role` y cualquier intento de sustituir claims.
- DTO `whitelist + forbidNonWhitelisted`, UUID estricto, longitudes y cantidades acotadas.
- Logs sin JWT, cuerpo completo, nombres de items ni respuesta de Accommodations.
- Secretos mediante `_FILE`, contenedor no-root, read-only y `no-new-privileges`.

## API Gateway

El repositorio implementa el Gateway con NestJS, no Nginx/Kong. Se añadirá:

- `GATEWAY_ROOM_INVENTORY_BASE_URL`, timeout/circuito y configuración JWT específica.
- Audience `stayhub-room-inventory-service`, scope `inventory:manage` y token delegado con `sub/role`.
- Proxy de las tres rutas con allowlist de headers/body, límites de tamaño y Problem Details.
- Swagger público y pruebas Gateway → stub Inventory; E2E real en Compose.

Gateway no valida ownership contra Accommodations ni ejecuta reglas de inventario.

## Observabilidad y salud

- Logs JSON: `traceId`, ruta, rol, roomId pseudonimizado, operación, versión y duración.
- Métricas: duración/errores HTTP, duración DB, conflictos de versión, items por habitación, latencia/errores/circuito de Accommodations.
- Trazas: Gateway → Inventory → Accommodations/PostgreSQL.
- `/health/live`: proceso; `/health/ready`: configuración, migraciones y PostgreSQL obligatorios. Accommodations se muestra degradado; las lecturas locales no se presentan como ownership verificado si no puede consultarse.
- Shutdown: detener HTTP, esperar solicitudes y cerrar conexiones.

## Docker y configuración

- `inventory-db`: PostgreSQL 16, volumen/credencial/red exclusivos.
- `room-inventory-migrate`: `prisma migrate deploy`, espera DB sana y termina.
- `room-inventory-service`: puerto 3008, no-root, health check y `restart: unless-stopped` porque no está clasificado como crítico `always` en `tendencias.md`. Redes `inventory-internal` (base) y `services` (Gateway y Accommodations).
- Todo se declara en `docker-compose.yml`; los secretos locales los genera `scripts/generate-compose-dev-env.mjs`.
- Variables `INVENTORY_*`: puerto, DB URL file, JWT entrante, URL/timeout/circuito Accommodations, JWT saliente (clave privada, kid, issuer, audience, scope), máximo de items/cantidad, OTLP y shutdown grace.

**Códigos de error del contrato**: 400 para violaciones del DTO (incluye PUT con más de 200 items, IDs duplicados o desconocidos); 422 para límites del agregado que dependen del estado persistido (POST que llevaría la habitación a 201 items).

## Estrategia de pruebas

| Suite | Evidencia |
|---|---|
| unit | reglas item/agregado, límites, versión, reemplazo idéntico y ownership. |
| integration PostgreSQL | migración vacía, add/replace atómicos, soft-deactivate, concurrencia y rollback. |
| contract | OpenAPI público y contrato consumer/provider Accommodations. |
| security | OWNER ajeno, ADMIN, GUEST, JWT inválido, spoofed headers, campos extra e inputs maliciosos. |
| performance | GET con 200 items, p95 < 500 ms y error < 1 %. |
| e2e | Gateway → Inventory → Accommodations + PostgreSQL en Compose. |

Cobertura mínima 70 %. Los mocks no sustituyen PostgreSQL, proveedor real o E2E distribuido.

## Dependencias y orden

1. Congelar OpenAPI público, contrato interno y semántica PUT/version.
2. Crear workspace, configuración, Prisma, migración y Dockerfile.
3. Implementar dominio, repositorio y pruebas de transacción/concurrencia.
4. Implementar cliente/contrato Accommodations y seguridad.
5. Implementar casos de uso, DTOs, controller y Swagger.
6. Integrar Gateway y Compose.
7. Ejecutar seguridad, rendimiento, E2E y revisión de alcance.

Después del paso 1 pueden avanzar en paralelo infraestructura DB, dominio, cliente contra stub y Gateway contra stub. Las escrituras y el E2E real dependen del proveedor Accommodations.

## Corte de 10 horas

La estimación original cubre un MVP pequeño: workspace, dos tablas, tres endpoints, autenticación básica, contrato Accommodations, OpenAPI y pruebas esenciales. Gateway/Compose distribuido, rendimiento y hardening deben mantenerse como gates de terminado aunque requieran coordinación adicional; no se marcarán completos sin evidencia.

Si es necesario reducir alcance, se conserva primero GET/POST/PUT, ownership, validación, transacción y OpenAPI. No se añaden Redis, RabbitMQ, alertas de stock, compras, precios, cargos, calendarios o frontend.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Confundir inventario con disponibilidad de reservas | Límites explícitos; Bookings conserva disponibilidad por fechas. |
| OWNER modifica habitación ajena | Contexto autoritativo Accommodations y guard dentro de Inventory. |
| Actualizaciones perdidas | `expectedVersion`, update condicional y prueba concurrente. |
| Dependencia Accommodations ausente | Contrato mínimo como gate; stub no se declara integración completa. |
| Ampliar service JWT rompe Booking Quote | Scopes separados por endpoint y pruebas de regresión del contrato existente. |
| PUT ambiguo | Reemplazo completo, omisión desactiva y replay idéntico documentados. |
| Scope creep | Solo tres endpoints y campos mínimos; inventario de propiedad/órdenes fuera. |
| Conflictos en Gateway/Compose | Cambios compartidos aislados y coordinados. |

## Criterios técnicos de terminado

- Tres endpoints conformes a contrato y autorización.
- Ownership validado contra Accommodations real.
- Migración, atomicidad y concurrencia verificadas en PostgreSQL 16.
- p95 < 500 ms, cobertura >= 70 %, lint/typecheck/build verdes.
- Gateway y Compose ejecutados; imagen no-root, health y shutdown verificados.
- Revisión humana confirma criterio del Sprint 4 y ausencia de RQ-12/RQ-13 o funcionalidad no aprobada.

## Complexity Tracking

Sin violaciones constitucionales. El contrato interno nuevo es necesario porque el endpoint público solo recibe `roomId` y no existe una consulta autoritativa actual para verificar propiedad/ownership sin compartir base de datos.
