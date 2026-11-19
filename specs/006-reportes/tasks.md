# Tasks: Reports
Input: spec.md, plan.md, research.md, data-model.md, contracts/.
## Phase1 Setup
- [x] T001 Crear paquete aislado, tsconfig, lint y Jest en apps/reports-service/ y scripts raíz package.json.
## Phase2 Foundational
- [x] T002 Pruebas de fechas/dinero/ocupación en apps/reports-service/test/metrics.spec.ts.
- [x] T003 Implementar dominio en apps/reports-service/src/domain/metrics.ts; UTC[from,to), máximo366d, BigInt string por moneda, oferta desconocida null.
- [x] T004 Crear ReportSnapshot en apps/reports-service/prisma/schema.prisma y migración; key única, ownerId UUID, payload JSON, generatedAt timestamptz e índice owner/fecha.
- [x] T005 Implementar configuración, JWT y persistencia en apps/reports-service/src/infrastructure/; scope reports:read, RS256, kid/issuer/audience/exp/iat y rol/ownership.
## Phase3 US1 Resumen
Independent test: dos owners, ADMIN, GUEST y fuente fallida.
- [x] T006 [US1] Agregar fuente Bookings en apps/bookings-service/src/interfaces/http/internal/report-facts.controller.ts, paginada200 sin PII.
- [x] T007 [US1] Implementar clientes REST y caso de uso en apps/reports-service/src/application/ y src/infrastructure/sources.ts; límite10000, timeout y fallo cerrado.
- [x] T008 [US1] Agregar tres consultas, salud y Swagger en apps/reports-service/src/interfaces/http.ts y src/main.ts.
- [x] T009 [US1] Verificar autorización y fuentes con Supertest en apps/reports-service/test/http.spec.ts.
## Phase4 US2 Ingresos
Independent test: cobro y reembolso en fechas distintas, duplicados, COP/USD.
- [x] T010 [US2] Agregar contrato por lotes200 en apps/payments-service/src/interfaces/http/reports-facts.controller.ts; approvedAt y primera transición COMPLETED.
## Phase5 US3 Ocupación
Independent test: cuatro de diez noches40%, checkout excluido y baseline ausente null.
- [x] T011 [US3] Historial ReportSupplyVersion en apps/accommodations-service/prisma/ y property.repository.ts, transaccional y baseline sin reconstrucción histórica.
- [x] T012 [US3] Fuente autorizada en apps/accommodations-service/src/interfaces/http/internal/report-supply.controller.ts.
## Phase6 US4 Panel y operación
Independent test: filtros, permisos, tablas accesibles, demo separado y Docker con persistencia.
- [x] T013 [US4] Proxy Gateway en apps/api-gateway/src/modules/reports/ y configuración/dev.
- [x] T014 [US4] Panel/API/rutas React en apps/web/src/{api/reports.ts,pages/host/Reports.tsx,app/routes.tsx}; filtros, tarjetas, SVG/tablas, errores, vacío y fuentes.
- [x] T015 [US4] Tests panel/Gateway/fuentes en sus carpetas test y Reports.test.tsx.
- [x] T016 [US4] Imagen multi-stage, Compose, entorno y demo en infra/docker/reports/, docker-compose.reports.yml y scripts/reports-*.mjs.
## Phase7 Polish
- [x] T017 Ejecutar suites/cobertura, lint/tipos/build, OpenAPI y smoke PostgreSQL/Docker; documentar evidencia en specs/006-reportes/quickstart.md.
- [x] T018 Actualizar README, contratos y CI en apps/reports-service/README.md, specs/006-reportes/contracts/ y .github/workflows/.
## Dependencias
T001 → T002 → T003 → T004/T005 → T006/T010/T011/T012 → T007 → T008/T009 → T013/T014/T015 → T016 → T017/T018.
Paralelismo posible por archivos: tests fuentes y UI tras contratos; no ejecutar mutaciones simultáneas sobre mismo archivo.
MVP US1 valida ámbito; alcance final incluye todas las historias confirmadas. Checks y resultados deben constar antes de marcar tareas. CI y revisión de equipo se reportan aparte.
