# Plan: cerrar la integración Gateway↔servicios y conectar el Frontend al Gateway (HTTP)

> **Estado: EJECUTADO el 2026-11-18.** Cadena levantada en HTTP, `smoke:local` 15/15 OK, frontend conectado al Gateway real sin mocks y pago intacto (simulado). Evidencia en `docs/frontend-gateway-validation.md` (sección 2026-11-18). Único hueco abierto: H2 (`GET /properties?mine=true`).

Fecha: 2026-11-18
Alcance: desarrollo local sobre **HTTP plano** (no HTTPS). El pago permanece **simulado en el cliente** (`apps/web/src/api/payments.ts`); no se implementa pago real.

## 0. Estado actual (punto de partida verificado)

Gran parte del cableado ya existe. Lo confirmado leyendo el repo:

- El Gateway conecta 6 servicios con proxies reales: auth, users, accommodations, bookings, reviews, search (`apps/api-gateway/src/app.module.ts`). Payments y Notifications son internos por diseño y NO se exponen.
- El frontend ya usa un cliente axios real contra el Gateway (`apps/web/src/api/http.ts`, `VITE_API_BASE_URL=/api/v1`); Vite hace proxy de `/api` a `WEB_GATEWAY_URL` (`apps/web/vite.config.ts`).
- Ya existen scripts de arranque local en HTTP:
  - `npm run dev:swagger -- --build` → auth (3001) + users (3002)
  - `npm run dev:backend` → accommodations (3003), search (3004), bookings (3005), payments (3006), reviews (3007), notifications (3009)
  - `npm run dev:gateway` → Gateway en **HTTP** 8080 (`GATEWAY_PROTOCOL: 'http'` en `scripts/dev-gateway.mjs`)
  - `npm run dev:web` → frontend en 5173
  - `npm run smoke:local` → prueba de humo end-to-end sin navegador (`scripts/dev-smoke.mjs`)
- Guías existentes: `docs/frontend-gateway.md`, `docs/frontend-gateway-validation.md`, `docs/dev-local-completo.md`.

Conclusión: **no hay que construir la integración desde cero**; hay que verificarla end-to-end en HTTP, cerrar huecos puntuales y retirar mocks. El trabajo real es de validación y de cierre de bordes, no de arquitectura.

## 1. Objetivos

1. Levantar toda la cadena en local sobre HTTP y demostrar que el navegador llega al Gateway y éste a los 6 servicios.
2. Dejar el frontend consumiendo el Gateway real (sin mocks MSW) en los flujos soportados.
3. Verificar la conexión de forma reproducible (smoke + recorrido manual).
4. Mantener el pago simulado tal como está.

## 2. Huecos detectados a cerrar

| # | Hueco | Evidencia | Acción |
|---|---|---|---|
| H1 | `scripts/dev-gateway.mjs` inyecta `GATEWAY_REDIS_PASSWORD_FILE` pero el Redis de borde dev puede no requerir password | `dev-gateway.mjs` | Verificar en arranque; ajustar solo si falla el readiness. |
| H2 | El frontend llama `GET /properties?mine=true`, endpoint que el contrato de accommodations NO expone | comentario en `apps/web/src/api/properties.ts` (`getMyProperties`) | Decidir: dejar ese flujo con mock hasta que exista, o implementar listado por owner en accommodations + proxy. |
| H3 | Mocks MSW activos opcionalmente (`VITE_API_MOCKS`) | `apps/web/.env.example`, `apps/web/src/mocks/browser.ts` | Confirmar `VITE_API_MOCKS=false` y validar cada cliente contra el Gateway real. |
| H4 | `package.json` scripts agregados `build`/`lint`/`typecheck`/`test` NO incluyen accommodations ni notifications | `package.json` (`build` y `test` omiten `:accommodations` y `:notifications`) | Añadirlos a los agregados o documentar por qué se excluyen. |
| H5 | No existe verificación automatizada navegador→Vite→Gateway; `frontend-gateway-validation.md` la deja pendiente | `docs/frontend-gateway-validation.md` ("Verificación pendiente") | Ejecutar `smoke:local` y registrar resultado real. |

## 3. Tareas

### Fase A — Arranque y verificación HTTP (sin cambios de código)

- [ ] A1. Preparar entorno: `npm ci` y `npm run env:auth:dev`. Requiere Docker/Podman activo.
- [ ] A2. Terminal 1: `npm run dev:swagger -- --build`. Esperar readiness de users (3002) y auth (3001).
- [ ] A3. Terminal 2: `npm run dev:backend`. Esperar "SERVICIOS LISTOS" (3003–3009).
- [ ] A4. Terminal 3: `npm run dev:gateway`. Confirmar Gateway en `http://127.0.0.1:8080` y que arranca con `GATEWAY_PROTOCOL=http` (no TLS).
- [ ] A5. Verificar salud del borde: `GET http://127.0.0.1:8080/health/ready` responde 200 y chequea los 6 destinos.
- [ ] A6. Ejecutar `npm run smoke:local`. Debe recorrer register/login → propiedad → foto → publicar → búsqueda → reseñas → reserva → historial, todo vía `/api/v1` sobre HTTP. Registrar el conteo "N/N pasos OK".

### Fase B — Frontend ↔ Gateway sobre HTTP

- [ ] B1. Crear `apps/web/.env.local` con `VITE_API_BASE_URL=/api/v1` y `VITE_API_MOCKS=false` (sin mocks).
- [ ] B2. Asegurar que el proxy de Vite apunta por HTTP: en la raíz `.env`, `WEB_GATEWAY_URL=http://127.0.0.1:8080` (ya es el default en `vite.config.ts`). No usar `env:web:https`.
- [ ] B3. Terminal 4: `npm run dev:web`. Abrir `http://localhost:5173` (usar `localhost`, no 127.0.0.1, para Web Locks).
- [ ] B4. Recorrido manual: registrar GUEST y OWNER (correos distintos), login, ver nombre de perfil, recargar (restaura sesión vía refresh), abrir 2ª pestaña (renovación coordinada), logout (no restaura al recargar).
- [ ] B5. Confirmar en DevTools → Network que las llamadas van a `http://localhost:5173/api/v1/...` y el proxy las reenvía al Gateway en `:8080` por HTTP (sin https, sin advertencias TLS).

### Fase C — Cierre de huecos puntuales

- [ ] C1. (H2) Decisión sobre `getMyProperties`. Opción A (mínima): mantener el mock de `?mine=true` documentado y excluir ese flujo de la validación "real". Opción B (completa): implementar en accommodations-service un listado por owner, exponerlo en el proxy del Gateway, y actualizar `properties.ts`. Elegir A para este alcance salvo que se pida lo contrario.
- [ ] C2. (H3) Barrer `apps/web/src/api/*.ts` y confirmar que ningún cliente de un flujo soportado dependa de MSW. Para los que sí (p. ej. `?mine=true`), marcarlos explícitamente como "pendiente de endpoint".
- [ ] C3. (H4) Añadir accommodations y notifications a los scripts agregados de `package.json` (`build`, `lint`, `typecheck`, `test`) o dejar nota del motivo de exclusión. Verificar que `npm run build` sigue pasando.

### Fase D — Validación final y documentación

- [ ] D1. Correr las comprobaciones de `docs/frontend-gateway.md` sección "Verificación": `typecheck:web`, `lint:web`, `test:web`, `build:web`, y las de gateway (`typecheck`, `lint`, `test --selectProjects unit contract`, `build`).
- [ ] D2. Actualizar `docs/frontend-gateway-validation.md` con el resultado real del recorrido navegador→Vite→Gateway→servicios en HTTP (hoy figura como pendiente).
- [ ] D3. Dejar constancia de que el pago sigue simulado (sin cambios en `payments.ts`).

## 4. Criterios de aceptación (verificación de que la conexión es efectiva y por HTTP)

1. `GET http://127.0.0.1:8080/health/ready` → 200.
2. `npm run smoke:local` termina con todos los pasos OK contra `http://127.0.0.1:8080/api/v1`.
3. En el navegador, un registro+login real de GUEST y OWNER funciona y el tráfico de red es HTTP (esquema `http://`, nunca `https://`), confirmado en DevTools.
4. `VITE_API_MOCKS=false` y los flujos soportados responden con datos del Gateway, no de MSW.
5. El Gateway arranca con `GATEWAY_PROTOCOL=http` (comprobable en `scripts/dev-gateway.mjs` y en el log de arranque).
6. El flujo de pago sigue usando `simulateCharge` del cliente; no se añadió llamada de pago al Gateway.

## 5. Fuera de alcance

- Pago real / endpoint de pagos en el Gateway (se mantiene la simulación de `payments.ts`).
- HTTPS/TLS local (se trabaja en HTTP plano).
- Exponer notifications/payments en el Gateway (son internos por diseño).
- Resolver conflictos preexistentes de `.github/workflows/ci.yml` (ajenos a esta integración).

## 6. Riesgos

- Requiere Docker/Podman operativo; `frontend-gateway-validation.md` registra que el motor falló antes. Si Docker no arranca, la verificación end-to-end queda bloqueada.
- La proyección de búsqueda depende de eventos (RabbitMQ); los resultados de `/search` pueden tardar o venir vacíos en el primer smoke.
- El proyecto declara Node 20 (`.nvmrc`, `engines`); validar con esa versión para evitar divergencias con CI.
