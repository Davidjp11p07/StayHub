# Verificación — Room Inventory Service (Sprint 4)

**Fecha**: 2026-11-16  
**Alcance**: room-inventory-service, provider de Accommodations y proxy de API Gateway.  
**Entorno local**: Node.js 26.13.0, Podman 5.8.9 rootless y PostgreSQL 16 en contenedor. Docker no está instalado; las verificaciones de runtime se hicieron con Podman y se indica explícitamente cuándo algo no pudo ejecutarse.

## Resultados ejecutados

| Comando | Resultado |
|---|---|
| `npm run lint:inventory` | OK |
| `npm run typecheck:inventory` | OK |
| `npm run build:inventory` | OK |
| `npm run test:inventory:unit` | 65/65 passed |
| `npm run test:inventory:contract` | 63/63 passed |
| `npm run test:inventory:security` | 59/59 passed |
| `npm run test:inventory:integration` (PostgreSQL 16 real) | 34/34 passed |
| `npm run test:inventory:coverage` (PostgreSQL 16 real) | 224 passed, 5 skipped; cobertura 89.04 % statements, 79.24 % branches, 91.85 % functions, 90.32 % lines |
| `npm run test:performance --workspace @stayhub/room-inventory-service` | 1/1 passed; p95 **6.05 ms**, error 0 %, plan con Index Scan sobre `inventory_items_room_type_idx` |
| `npm run test:e2e --workspace @stayhub/room-inventory-service` (Podman, contenedor real) | 6 passed, 1 skipped; no-root, read-only, health y restart verificados |
| `npm run openapi:inventory:check` | OK: 3 operaciones públicas + 1 provider |
| `npm run lint|typecheck|build:accommodations` | OK |
| `npm run test:accommodations` (PostgreSQL 16 real) | 446/446 passed en unit, integration, contract y security |
| `npm run test:contract --workspace @stayhub/accommodations-service` | 55/55 passed, incluido el contrato `getRoomInventoryContext` |
| `npm run openapi:accommodations:check` | OK: 6 operaciones v1 |
| `npm run lint|typecheck|build --workspace @stayhub/api-gateway` | OK |
| `npm run test:unit --workspace @stayhub/api-gateway` | 349/349 passed |
| `npm run test:integration --workspace @stayhub/api-gateway` | 150 passed, 17 skipped |
| `npm run test:contract --workspace @stayhub/api-gateway` | 111 passed, 32 skipped |

## Contratos y seguridad

- Contrato público de Inventory validado: `GET/PUT /inventory/rooms/{roomId}` y `POST /inventory/rooms/{roomId}/items`.
- Contrato provider de Accommodations validado: `GET /internal/v1/rooms/{roomId}/inventory-context`.
- JWT delegado Gateway → Inventory: RS256, `kid`, audience `stayhub-room-inventory-service`, scope `inventory:manage`, `sub`/`role`, TTL ≤ 300 s.
- JWT de servicio Inventory → Accommodations: emisor y clave propios, scope `accommodations:inventory-context`, TTL ≤ 60 s.
- Scopes por endpoint en Accommodations: un token de Booking Quote no puede invocar Inventory Context y viceversa.
- Pruebas de seguridad cubren JWT inválido, OWNER ajeno, GUEST, headers suplantados, body >64 kb, inyección y logs redactados.

## Evidencia real adicional (Podman + PostgreSQL 16)

- Migración `001_room_inventory` aplicada y `migrations-health`, transacciones, concurrencia y rendimiento ejecutados contra PostgreSQL real.
- Imagen `room-inventory` construida y ejecutada con usuario `node`, `--read-only`, `--tmpfs /tmp`, `--cap-drop ALL`; `/health/live` y `/health/ready` respondieron 200.
- Reinicio del contenedor verificado; volvió a estar sano.
- Provider real de Accommodations arrancado contra PostgreSQL: Inventory devolvió `200` con `version=0` para una habitación nueva y `201/version=1` al crear un item; `/health/ready` reportó `accommodations: up`.
- Accommodations completo (446 pruebas) y su contrato de provider pasan con PostgreSQL real.

## Compose real y flujo Gateway (T077/T079)

Se levantó con Podman Compose el subconjunto necesario del stack: PostgreSQL de Auth/Users/Accommodations/Inventory, Redis de Gateway/Auth, migraciones, `auth-service`, `users-service`, `accommodations-service`, `room-inventory-service` y `api-gateway`.

- Migraciones `auth`, `users`, `accommodations` e `inventory`: exit 0.
- Servicios y bases: healthy.
- Registro real `POST /api/v1/auth/register` y login `POST /api/v1/auth/login` vía Gateway: 201/200.
- Creación real de propiedad/habitación vía Gateway: 201.
- **T077** ejecutado con `INVENTORY_E2E_GATEWAY_URL`, `INVENTORY_E2E_ACCESS_TOKEN` e `INVENTORY_E2E_ROOM_ID`: 3 passed, 4 skipped (sin contenedor Docker adicional).
- Flujo validado: GET inicial, POST 201, PUT 200, replay idempotente 200 y versión estable, PUT divergente 409.
- `room-inventory-service` recibió `SIGTERM` ordenado: exit code 0.
- `/health/ready` de Inventory con PostgreSQL y Accommodations reales: `{"status":"ready","database":"up","accommodations":"up"}`.
- Hallazgo corregido: `auth-service` no compartía la red `services` con `users-service`, por lo que el registro fallaba con 503 hasta añadir esa red en Compose.

## Revisión de trazabilidad y alcance (T080)

- **Sprint 4**: los tres endpoints documentados existen y el criterio “el inventario se actualiza correctamente” está cubierto por POST/PUT, versión optimista, replay y 409.
- **RQ-12/RQ-13**: no se implementaron Reports ni Recommendations.
- **Fuera de alcance**: no hay reservas, pagos, precios, stock mínimo, pedidos, Redis/RabbitMQ ni frontend en Inventory; Inventory solo usa PostgreSQL propio.
- **Booking Quote**: regresión cubierta por la suite completa de Accommodations (446/446) y contrato provider (55/55).
- **Alcance externo**: los únicos cambios fuera de Inventory son el provider mínimo de Accommodations, el proxy de Gateway y su integración Compose, conforme a T025–T027 y T070–T074.
- **Riesgo residual**: la revisión es asistida por IA; se recomienda firma humana final antes de declarar el Sprint 4 cerrado.

## Conclusión

El código, contratos, pruebas unitarias/contractuales/seguridad y cobertura local están verdes. No se declara la integración distribuida completa mientras T069, T074 runtime, T077 y T079 no se ejecuten con Docker/PostgreSQL reales.
