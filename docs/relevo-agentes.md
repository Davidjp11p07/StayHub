# RELEVO — STAYHUB (estado operativo vigente)

- Actualizado: 2026-11-19 18:12 (Bogotá).
- Worktree / rama / HEAD inicial: `stayhub-integracion-local`, `local/stayhub-integracion`, `7c2bbc6`.
- Git: limpio al arrancar. Para identificar el commit del checkpoint, ejecutar `git log -1 --oneline -- docs/relevo-agentes.md`. Incluye el contrato del usuario, el relevo, el historial y dos pruebas de Bookings.
- Control de escritura: al inspeccionar procesos no se observó una compilación, migración ni escritura Git concurrente. Vite local en ejecución.

## TAREA ACTIVA

- REQ-07: CORREGIDO-Y-VERIFICADO para exclusión por habitación, cancelación y liberación por vencimiento. El bloqueo transaccional ya existía. SEARCH-04: DIAGNOSTICADO; siguiente unidad del mismo bloque P0.
- API real: Bogotá y Bogota devuelven HTTP 200 y la misma propiedad. Del 1 al 3 de junio de 2027, Bogotá devuelve 200, total 0, PROJECTED.
- Accommodations es dueño de publicación, habitaciones, capacidad y tarifa. Su outbox envía availability vacío. Search filtra ventanas que cubran la estancia completa y los huéspedes. Room Inventory guarda artículos por habitación.
- Bookings es dueño de la ocupación. La exclusión GiST bookings_no_overlap bloquea la misma habitación en [entrada, salida) en PENDING_PAYMENT, CONFIRMED y CHECKED_IN. El vencimiento libera el periodo cuando el worker persiste EXPIRED. REVIEW_REQUIRED conserva la retención.
- Última operación: segunda ejecución de ocho intentos por el gateway; se reutilizaron las mismas fechas y ambas reservas de cada ejecución quedaron canceladas.
- Siguiente acción exacta: ampliar el contrato `UpsertProjectionData` en `apps/search-service/src/domain/projection-event.ts` y su esquema de eventos para recibir la oferta de habitaciones con ID, capacidad, precio y moneda desde el outbox de Accommodations. Conservar compatibilidad con instantáneas anteriores e incorporar la ocupación autorizada de Bookings antes de mostrar disponibilidad por fechas.

## ENTORNO Y PRUEBAS

- Compose local: docker-compose.yml + docker-compose.reports.integration.yml + .artifacts/compose-local-ports.yml. Docker muestra los servicios de integración en ejecución. PostgreSQL aislado de Bookings en 55437 y PostGIS aislado de Search en 55438.
- Migraciones y reconstrucciones de esta unidad: ninguna; cambios en pruebas y documentación. Vite y un proceso de desarrollo/renovación identificados. Ollama NO VERIFICADO.
- PASS: `npm.cmd run typecheck:bookings`. PostgreSQL aislado 55437: `booking-overlap.spec.ts` + `payment-saga.spec.ts`, 14/14. Se probó que al vencer el plazo todavía hay conflicto hasta que el worker persiste EXPIRED, y después se admite otra reserva.
- PASS API: `scripts/e2e-booking-concurrency.mjs` con STAYHUB_TEST_BOOKING_ATTEMPTS=8, offset 321, propiedad de demostración Bogotá. Dos ejecuciones: un 201 y siete 409 BOOKING_CONFLICT en cada tanda y una nueva reserva después de cancelar.
- PASS Chrome: `scripts/e2e-booking-browser.cjs`, propiedad Bogotá, offset 322: confirmación, conflicto, cancelación, REFUNDED. `scripts/e2e-search-dates.cjs`: mensaje de disponibilidad incompleta. Regresión general NO CORRIDA.

## SIGUIENTES 3 PRIORIDADES

1. SEARCH-04 / REQ-04: conectar oferta y ocupación por habitación en Search. Validar fechas libres y ocupadas, actualización de precios/capacidad, reconstrucción y reentrega.
2. AUTH-S2S / REG-503: renovación automática y registro idempotente.
3. PAY-04 / REQ-03: compensación tardía con Payments real.

## RIESGOS Y TRASLADO A MAIN

- Conservar las bases compartidas, los 37 inmuebles y los overrides ignorados. Nunca ejecutar las suites que truncan tablas en la pila compartida.
- Preparación para PR y Azure pendiente. Trabajar exclusivamente en la rama de integración.
