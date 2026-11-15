# Implementation Plan: Reports
**Branch**: feat/reports-service | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

## Summary
Servicio NestJS 3011, panel React integrado y Docker. Agregación síncrona por contratos REST internos. Reports conserva el último resultado por ámbito en su base propia, nunca consulta bases ajenas y no oculta fallos usando caché. No necesita broker adicional para consultas síncronas.

## Technical Context
TypeScript estricto, Node20, NestJS10, Prisma6.19, PostgreSQL16, React/Tailwind y versiones existentes. JWT RS256 directo y delegado Gateway; fuentes requieren sujeto reports-service y scope reports:read. Bookings y Alojamientos paginados (200/página, máximo10000); Payments por lotes de200 IDs de reservas autorizadas. Timeout y fallo cerrado. Jest/Supertest, Vitest, pruebas PostgreSQL y Compose; cobertura mínima70%.
Fechas UTC [from,to), máximo366 días. Comparación anterior de igual duración. Dinero BigInt serializado string, separado por moneda. Ocupación por noche sobre oferta publicada, sin inventar disponibilidad previa al primer registro.

## Constitution Check
Antes/después: RQ-12 aprobado; capas separadas; base propia; REST síncrono justificado; scopes y autorización por owner; Docker, contratos y pruebas. CI y revisión externa se reportan aparte de validación local. Sin excepciones arquitectúnicas.

## Project Structure
- apps/reports-service/{src/{domain,application,infrastructure,interfaces},prisma,test,scripts}
- apps/{bookings-service,payments-service,accommodations-service}/src/interfaces/http/: contratos internos.
- apps/accommodations-service/prisma/: historial transaccional de oferta.
- apps/api-gateway/src/modules/reports/, apps/web/src/{api/reports.ts,pages/host/Reports.tsx}
- infra/docker/reports/, docker-compose.reports.yml, scripts/reports-*.mjs

## Execution
Dominio y contratos; fuentes y oferta; Reports y persistencia; Gateway/panel; Docker, pruebas y evidencia. No publicar ramas ni desplegar hosting externo.

## Complexity Tracking
Historial nuevo de oferta justificado porque el estado actual no reconstruye el pasado. Primer registro no afirma disponibilidad anterior.
