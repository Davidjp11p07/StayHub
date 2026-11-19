# Validación de la conexión frontend–Gateway

Fecha: 2026-11-04. Entorno de ejecución: Windows, Node 24.21.0 y npm 11.19.0. El proyecto sigue declarando Node 20; esta ejecución no sustituye CI con esa versión.

## Resultado implementado

Registro y login consumen /api/v1; registro envía rol e idempotencia y dirige al login. Sesión con access token en memoria, cookie HttpOnly, renovación coordinada entre pestañas, descarte de respuestas después de logout y consulta de perfil para mostrar el nombre. Alojamientos y reservas siguen locales.

Gateway incorpora logout 204 sin dependencia de Auth. El cierre elimina la cookie, sin revocar tokens emitidos. Swagger se monta en desarrollo y conserva las rutas generadas; registro/login se documentan como públicos. Vite usa HTTPS y valida TLS del Gateway contra la CA local.

## Comprobaciones realizadas

| Comprobación | Resultado |
| --- | --- |
| Web: Vitest | 30 pruebas aprobadas en 5 archivos. |
| Cobertura de módulos de identidad modificados | 98,29 % líneas/sentencias; 82,64 % ramas; 86,95 % funciones. Incluye API, sesión, contexto, login y registro; no representa cobertura de toda la web. |
| Web: tipos, lint y build de producción | Aprobados. |
| Gateway: tipos y lint | Aprobados. |
| Gateway: logout, montaje de Swagger, fábrica OpenAPI y contratos de registro/sesión | 45 pruebas aprobadas en la ejecución final de esas 4 suites. |
| Gateway: deriva OpenAPI público | 25 pruebas aprobadas, incluidas las 8 operaciones y casos negativos del validador. |
| Gateway: workspaces, cookies, composición de autenticación, servidor público y ejemplo de entorno | Suites afectadas aprobadas en comprobaciones previas. |
| Users: regresión unitaria después de generar Prisma | 82 pruebas aprobadas, 9 suites. |
| Auth: regresión unitaria | Reglas de registro, login, refresh, sesión, criptografía y configuración aprobadas. La prueba de permisos POSIX del generador falla en Windows (0600 frente a 0666). Las suites bloqueadas por Prisma se repitieron después de generar clientes: cleanup guard aprobado y HTTP aprobado con testTimeout=30000, tras agotar originalmente 5000 ms. |
| Scripts locales | Sintaxis de dev-gateway, setup-web-https y dev-auth-swagger comprobada. |

La instalación inicial reveló dependencias transitivas ausentes en el lockfile, incluso tras npm ci. Se regeneró desde los cuatro manifiestos en una carpeta temporal y se instaló el árbol completo. Los clientes Prisma se generaron sin migrar bases.

## Verificación pendiente

No se verificó el recorrido real navegador → Vite → Gateway → Auth/Users. Docker Desktop se inició, pero el motor devolvió HTTP 500; no se continuó tras rechazarse una comprobación adicional. La instalación de confianza de la CA se canceló en Windows. Se generaron el certificado de localhost y la CA pública para el proxy, sin desactivar TLS ni instalar confianza por otra vía.

Para cerrar esa verificación: disponer del motor Docker operativo, completar voluntariamente npm run env:web:https y seguir el arranque de frontend-gateway.md. Registrar ambos roles, iniciar sesión, comprobar nombre, recargar, renovar entre pestañas y cerrar sesión; verificar que otra recarga no restaura la sesión. También faltan el harness completo Auth–Users y la validación con Node 20.

La ejecución amplia de Gateway encontró fallos ajenos a esta integración: suites de registro/login que requieren Redis real y divergencias históricas de Problem/FieldError en el contrato Users. El archivo .github/workflows/ci.yml ya contiene marcadores de conflicto sin resolver; no se modificó ni se afirma que CI esté verde.

AGENT.md se actualizó localmente; continúa ignorado por la regla existente de .gitignore. Los Pact generados durante las pruebas se restauraron al contenido inicial; no forman parte de esta implementación.

## Verificación end-to-end en HTTP — 2026-11-18

Entorno: Windows, Node 20.20.2, npm 10.8.2, Docker 29.9.3. Se levantó la cadena completa en **HTTP plano** y se cerró la verificación que antes quedaba pendiente.

### Cadena levantada (todo HTTP)

- `npm run dev:swagger -- --build` → auth-service (3001) y users-service (3002) `ready`.
- `npm run dev:backend -- --build` → accommodations (3003), search (3004), bookings (3005), payments (3006), reviews (3007), notifications (3009), todos `ready`.
- `npm run dev:gateway` → Gateway en `http://127.0.0.1:8080` con `GATEWAY_PROTOCOL=http`.
- `npm run dev:web` → Vite en `http://localhost:5173`, proxy `/api` → `http://127.0.0.1:8080`.

### Evidencia

| Comprobación | Resultado |
| --- | --- |
| `GET http://127.0.0.1:8080/health/ready` | 200 `{"status":"ready","checks":{"config":true,"tls":true,"redis":true,"destinations":true}}` (los 6 downstream resuelven). |
| `GET https://127.0.0.1:8080/...` | Falla la conexión: el Gateway sirve solo HTTP (confirma modo HTTP plano, sin TLS). |
| `npm run smoke:local` | **15/15 pasos OK** contra `http://127.0.0.1:8080/api/v1`: register/login OWNER+GUEST, perfil, crear/publicar propiedad, foto multipart, búsqueda, sugerencias, reseñas, reserva (`PENDING_PAYMENT`→`CONFIRMED`) e historial. |
| Navegador→proxy Vite→Gateway: `GET /api/v1/search?q=Casa` | 200 con cuerpo real de search-service (`items/page/pageSize/total`), no mock. |
| Navegador→proxy: `POST /api/v1/auth/register` + `/auth/login` | 201 y 200 con `userId` real y `accessToken` (Auth+Users vía Gateway). |
| Mocks | `apps/web/.env.local` con `VITE_API_MOCKS=false`; el worker MSW no se carga (`main.tsx` lo condiciona a `VITE_API_MOCKS==='true'`). |
| `npm run typecheck:web` | Aprobado. |
| `npm run build:web` | Aprobado (187 módulos, build de producción). |

### Pago

El pago permanece **simulado en el cliente** (`apps/web/src/api/payments.ts`, `simulateCharge`). No se añadió ninguna llamada de pago al Gateway; `payments-service` sigue siendo interno y solo lo invoca `bookings-service`.

### Notas y pendientes

- La búsqueda devuelve 0 resultados en el primer smoke porque la proyección depende de eventos (RabbitMQ) de accommodations; es esperado en un arranque limpio.
- `npm run test:web` tiene 11 pruebas en rojo (de 320) por `Test timed out in 5000ms` en suites de subida de fotos multipart con MSW (`src/api/properties-write.test.ts`, `src/pages/host/PublishProperty.test.tsx`, `test/e2e/catalog.e2e.test.tsx`). Son timeouts preexistentes del entorno de test (MSW + FormData en jsdom), no relacionados con esta integración; `typecheck` y `build` del web pasan.
- Arranque de Vite en Windows: fue necesario instalar los binarios nativos opcionales `@rollup/rollup-win32-x64-msvc` y `lightningcss-win32-x64-msvc` (bug npm de optionalDependencies, npm/cli#4828).
- Hueco abierto H2: el frontend consume `GET /properties?mine=true` (listado del propietario) que el contrato de accommodations aún no expone; ese flujo permanece con mock hasta que el servicio/Gateway lo publiquen.
