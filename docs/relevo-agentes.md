# RELEVO — STAYHUB (estado operativo vigente)

- Actualizado: 2026-11-19 18:56 (Bogotá).
- Worktree y rama: `stayhub-integracion-local`, `local/stayhub-integracion`. Padre del checkpoint: `c25081b` (REQ-07). Para obtener el hash del cierre de SEARCH-04: `git log -1 --oneline -- docs/relevo-agentes.md`.
- Git: cambios de esta unidad destinados a un commit local. Sin push. El contrato continúa en `docs/instrucciones-integracion-codex.md`.
- Control de escritura: un agente en este worktree. No se observaron otros builds, migraciones ni operaciones de escritura Git al inicio.

## TAREA ACTIVA

- SEARCH-04 / REQ-04: CORREGIDO-Y-VERIFICADO localmente. El evento de Accommodations lleva las habitaciones con ID, capacidad, precio y moneda. Search consulta a Bookings en lotes de hasta 256 antes de paginar. Las consultas con fechas omiten Redis. La proyección previa sigue admitiendo ventanas explícitas; una instantánea antigua sin información no anuncia disponibilidad.
- Bookings aplica la misma exclusión por habitación y estancia [entrada, salida) para retenciones pendientes, reservas confirmadas y check-in. Un error de consulta de ocupación impide responder con habitaciones libres. REQ-07 verificado.
- Última operación funcional: API y Chrome verificaron filtros, foto, tarifa, detalle y regreso desde página 999. La API verificó conflicto de reserva, disponibilidad en el día de salida y liberación tras cancelación. Durante una repetición, el registro respondió HTTP 503 antes de enviar ninguna reserva. Una ejecución posterior pasó; REG-503 sigue pendiente.
- Siguiente unidad P0: AUTH-S2S / REG-503. Siguiente comando exacto: `rg -n "getToken|OUTBOUND_SERVICE_TOKENS|REVIEWS_BOOKINGS_SERVICE_TOKEN|refresh-compose-service-tokens" apps/bookings-service/src apps/reviews-service/src scripts/refresh-compose-service-tokens.mjs docker-compose.yml`. Para registro, seguir `RegisterAccountUseCase.execute` en `apps/auth-service/src/application/registration/register-account.use-case.ts` y el intento Auth→Users con una misma clave de idempotencia. El fallo observado carece de causa confirmada.

## ENTORNO Y PRUEBAS

- Compose: `docker-compose.yml` + `docker-compose.reports.integration.yml` + `.artifacts/compose-local-ports.yml`. Se recrearon Gateway, Search y Bookings. Migraciones aplicadas: `002_search_room_offers` (Search) y `202611190002_search_room_offers` (Accommodations). En un checkout ya configurado, generar solamente el nuevo par local con `node scripts/generate-compose-dev-env.mjs --search-availability-only`. Desplegar primero la migración y el consumidor Search actualizado, después el productor del catálogo.
- RabbitMQ real: instantánea 758 de Bogotá encolada con el broker del catálogo detenido y aplicada en Search tras arrancarlo. Broker restaurado. Catálogo: 38 publicaciones con oferta, las 37 demos cotejadas por ID con el estado local del seed.
- PASS Search: 54 unitarias, 60 de contrato, 14 en PostGIS aislado en 55438 (proyección y búsqueda). PASS Bookings: 12 en payment-saga en PostgreSQL aislado en 55437 y 5 del contrato OpenAPI. PASS Gateway: 19 pruebas de integración de búsqueda y rutas. PASS web: 38 pruebas de API y página de Search. Typecheck de Gateway, Search, Bookings y web; lint de Search, Bookings y web.
- PASS API: Bogotá/Bogota, Medellín, país exacto, filtros combinados, página fuera de rango con total conservado. Dos huéspedes, ocho intentos simultáneos, un 201 y siete 409. Con STAYHUB_TEST_DATED_SEARCH=1 el script comprueba antes, durante y después de reservar incluyendo fechas contiguas. Ruta interna sin JWT: 401.
- PASS Chrome: `scripts/e2e-search-dates.cjs`, propiedad sintética Bogotá, offset 325. Tarifa y foto en tarjeta, detalle, paginación con filtros. Gateway en 18080, Vite en 5173. Renovador temporal previo aún necesario para los otros servicios; Ollama NO VERIFICADO. Regresión integral NO CORRIDA.

## SIGUIENTES 3 PRIORIDADES

1. AUTH-S2S / REG-503: renovar credenciales automáticamente con validaciones vigentes y comprobar el registro idempotente ante fallos parciales.
2. PAY-04 / REQ-03: verificar compensación tardía con Payments real. Es la tarea independiente si el registro está bloqueado.
3. REQ-05: verificación autorizada de inmuebles y publicación.

## RIESGOS Y TRASLADO A MAIN

- Los filtros fechados dependen de Bookings en línea; el catálogo de habitaciones tiene consistencia eventual. Tiempo y consumo a escala mayor que el catálogo local NO VERIFICADOS.
- Conservar bases, fotos, 37 demos y archivos ignorados. Las suites que truncan tablas se ejecutan solo en bases aisladas.
- Checkpoints solo locales. Preparación del PR global y Azure pendientes.
