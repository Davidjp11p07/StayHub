# RELEVO — STAYHUB (estado operativo vigente)

- Actualizado: 2026-11-19 19:23 (Bogotá).
- Worktree y rama: `stayhub-integracion-local`, `local/stayhub-integracion`. Padre del checkpoint: `c25081b` (REQ-07). Para obtener el hash del cierre de SEARCH-04: `git log -1 --oneline -- docs/relevo-agentes.md`.
- Git: cambios de esta unidad destinados a un commit local. Sin push. El contrato continúa en `docs/instrucciones-integracion-codex.md`.
- Control de escritura: un agente en este worktree. No se observaron otros builds, migraciones ni operaciones de escritura Git al inicio.

## TAREA ACTIVA

- AUTH-S2S sobre 36cbc22: Bookings firma sus cuatro credenciales de salida bajo demanda con su clave propia y expiración de 240 s. Compose ya no monta los tokens temporales en Bookings. Verificado: 5 pruebas de adaptadores y Chrome con pago y REFUNDED. REG-503 simultáneo con la misma clave: 201/503 y repetición 201 con el mismo ID. Reviews también firma sus tokens bajo demanda.

- SEARCH-04 / REQ-04: CORREGIDO-Y-VERIFICADO localmente. El evento de Accommodations lleva las habitaciones con ID, capacidad, precio y moneda. Search consulta a Bookings en lotes de hasta 256 antes de paginar. Las consultas con fechas omiten Redis. La proyección previa sigue admitiendo ventanas explícitas; una instantánea antigua sin información no anuncia disponibilidad.
- Bookings aplica la misma exclusión por habitación y estancia [entrada, salida) para retenciones pendientes, reservas confirmadas y check-in. Un error de consulta de ocupación impide responder con habitaciones libres. REQ-07 verificado.
- Última operación funcional: API y Chrome verificaron filtros, foto, tarifa, detalle y regreso desde página 999. La API verificó conflicto de reserva, disponibilidad en el día de salida y liberación tras cancelación. Durante una repetición, el registro respondió HTTP 503 antes de enviar ninguna reserva. Una ejecución posterior pasó; REG-503 sigue pendiente.
- SIGUIENTE ACCIÓN PAY-04: ejecutar `rg -n "late|refund|cancel" apps/bookings-service/test/integration/payment-saga.spec.ts apps/bookings-service/src/infrastructure/persistence/prisma/payment-result.unit-of-work.ts` y reproducir la aprobación posterior a cancelar con Payments real.

## ENTORNO Y PRUEBAS

- Compose: `docker-compose.yml` + `docker-compose.reports.integration.yml` + `.artifacts/compose-local-ports.yml`. Se recrearon Gateway, Search y Bookings. Migraciones aplicadas: `002_search_room_offers` (Search) y `202611190002_search_room_offers` (Accommodations). En un checkout ya configurado, generar solamente el nuevo par local con `node scripts/generate-compose-dev-env.mjs --search-availability-only`. Desplegar primero la migración y el consumidor Search actualizado, después el productor del catálogo.
- RabbitMQ real: instantánea 758 de Bogotá encolada con el broker del catálogo detenido y aplicada en Search tras arrancarlo. Broker restaurado. Catálogo: 38 publicaciones con oferta, las 37 demos cotejadas por ID con el estado local del seed.
- PASS Search: 54 unitarias, 60 de contrato, 14 en PostGIS aislado en 55438 (proyección y búsqueda). PASS Bookings: 12 en payment-saga en PostgreSQL aislado en 55437 y 5 del contrato OpenAPI. PASS Gateway: 19 pruebas de integración de búsqueda y rutas. PASS web: 38 pruebas de API y página de Search. Typecheck de Gateway, Search, Bookings y web; lint de Search, Bookings y web.
- PASS API: Bogotá/Bogota, Medellín, país exacto, filtros combinados, página fuera de rango con total conservado. Dos huéspedes, ocho intentos simultáneos, un 201 y siete 409. Con STAYHUB_TEST_DATED_SEARCH=1 el script comprueba antes, durante y después de reservar incluyendo fechas contiguas. Ruta interna sin JWT: 401.
- PASS Chrome: `scripts/e2e-search-dates.cjs`, propiedad sintética Bogotá, offset 325. Tarifa y foto en tarjeta, detalle, paginación con filtros. Gateway en 18080, Vite en 5173. Bookings y Reviews ya no montan archivos del renovador; Ollama NO VERIFICADO. Regresión integral NO CORRIDA.

## SIGUIENTES 3 PRIORIDADES

1. AUTH-S2S / REG-503: renovar credenciales automáticamente con validaciones vigentes y comprobar el registro idempotente ante fallos parciales.
2. PAY-04 / REQ-03: verificar compensación tardía con Payments real. Es la tarea independiente si el registro está bloqueado.
3. REQ-05: verificación autorizada de inmuebles y publicación.

## RIESGOS Y TRASLADO A MAIN

- Los filtros fechados dependen de Bookings en línea; el catálogo de habitaciones tiene consistencia eventual. Tiempo y consumo a escala mayor que el catálogo local NO VERIFICADOS.
- Conservar bases, fotos, 37 demos y archivos ignorados. Las suites que truncan tablas se ejecutan solo en bases aisladas.
- Checkpoints solo locales. Preparación del PR global y Azure pendientes.

AUTH-S2S Reviews verificado para autenticación y rechazo de reservas inexistentes. Reviews y Bookings reconstruidos. 15 pruebas focalizadas y typecheck de Reviews aprobados. El gateway devolvió 404 BOOKING_NOT_ELIGIBLE. Pendiente probar publicación con estancia completada. Para preparar el nuevo secreto en un checkout existente: node scripts/generate-compose-dev-env.mjs --reviews-eligibility-only.

REG-503 CORREGIDO-Y-VERIFICADO para solicitudes idénticas simultáneas. E2E por gateway: 201/201 y replay con el mismo ID, 409 al cambiar el contenido, dos claves independientes con 201/201. Chrome: registro y login. 9 pruebas Auth, 18 web, typecheck y lint Auth aprobados. Auth reconstruido, sin migraciones. Causa del incidente histórico con claves distintas aún sin confirmar. Prueba reproducible: node scripts/e2e-registration-concurrency.mjs con NODE_EXTRA_CA_CERTS apuntando al certificado local.

## PAY-04 — Compensación tardía verificada en integración local

El 20 de noviembre de 2026 (UTC), el gateway aceptó dos reservas sintéticas y su cancelación. Payments usó la pasarela simulada local. La consulta de los historiales de Bookings y Payments mostró la siguiente secuencia.

| Reserva | Cancelación UTC | Aprobación UTC | Reembolso UTC |
| --- | --- | --- | --- |
| d1d7b12e-560b-48c7-b595-7adf0870dc33 | 00:26:02.221 | 00:26:03.139 | 00:26:04.606 |
| d27f2c00-32d1-48d0-a9fd-ec94780b5882 | 00:26:02.437 | 00:26:03.265 | 00:26:04.713 |

Cada reserva conservó CANCELLED_BY_GUEST, sin transición a CONFIRMED. Para cada una, la política fijó 318.000 COP, Bookings completó un único REQUEST_REFUND en un intento y Payments registró una sola devolución por el total. La ejecución usó scripts/e2e-booking-concurrency.mjs con la propiedad 2b626617-a318-48e6-b63e-b1582f3342ab y un desplazamiento de 343 días. El orden temporal se verificó por consulta posterior, no está garantizado en cada ejecución del script.

Siguiente unidad pendiente: REQ-05, verificación autorizada y publicación de inmuebles.
REQ-05 parcial. Auth enumera explícitamente GUEST y OWNER para el alta pública y su reconciliación. Contratos de registro con VERIFIER y ADMIN rechazados (HTTP 400). Próxima unidad: aprovisionamiento autorizado del verificador y propagación de su rol en sesión. Flujo de publicación pendiente.
REQ-05 en curso. Preparación de migraciones aditivas de Users y Auth para VERIFIER. Las asignaciones estarán reservadas a un operador autorizado.
REQ-05 identidad verificada en integración. Migraciones 202611200001_verifier_role de Users y Auth aplicadas. La asignación por UUID requiere operador de Users y una cuenta dedicada GUEST activa. scripts/e2e-verifier-session.mjs verificó registro público 400, asignación repetida, nuevo login VERIFIER 200, perfil propio 200 y reporte restringido 403. 82 pruebas focalizadas y cuatro comprobaciones de tipos aprobadas. Siguiente unidad: solicitud, revisión y trazabilidad en Accommodations, seguida de la publicación, Search, reservas y UI.
REQ-05 en curso: historial de revisión por versión. Las publicaciones existentes conservan su estado histórico sin decisión de verificación inventada.

## REQ-05 — Revisión y publicación verificadas en integración

La migración aditiva 202611200002_property_verification registra solicitante, versión, decisión, motivo, verificador y fecha. Las publicaciones anteriores, incluidas las demos, conservan su estado sin acreditación retrospectiva. El propietario solicita revisión; al editar una publicación debe despublicarla. La decisión y la publicación se guardan en una transacción.

Chrome mostró la foto privada y permitió aprobar desde /verification. El gateway denegó la publicación directa y la decisión del propietario. Se comprobó rechazo, corrección y nueva solicitud. Repetir la aprobación dejó dos decisiones históricas en total (un rechazo y una aprobación). Search y Bookings ocultaron el inmueble pendiente o rechazado; tras aprobar entró en Search y aceptó una reserva. Después de despublicar salió de Search, se denegaron nuevas reservas y siguió accesible la anterior. La prueba canceló esa reserva sintética.

Lint y tipos comprobados en Accommodations, Gateway y web. En la ejecución conjunta de dos suites web pasaron 14/25 antes de los últimos ajustes de pruebas; quedaron fallos de multipart y de formulario en jsdom. La regresión web sigue abierta. Comando siguiente: npm.cmd run test:web -- --run src/pages/host/PublishProperty.test.tsx src/api/properties-write.test.ts. La pila Docker local queda en ejecución.

## Regresión web de REQ-05 cerrada

Vitest precarga FormData de Node antes de inicializar jsdom. Así el analizador multipart usa el constructor File compatible y MSW recibe el archivo completo. Se actualizaron las expectativas de catálogo y el mock del historial de revisión del propietario. Pasaron 28/28 pruebas focalizadas y 346/346 pruebas web en 37 archivos, además de lint y comprobación de tipos. La comprobación real en Chrome y la pila local corresponde al hito anterior. Este cambio afecta al entorno de pruebas.
Siguiente unidad: REQ-06, desayuno opcional tarifado. Primer comando: rg -n "BREAKFAST_INCLUDED|breakfast|desayuno" apps specs. La política de unidad de cobro se debe contrastar con los contratos antes de cambiar la cotización.
REQ-06 en curso. Primera unidad: oferta opcional por habitación, por huésped y noche, en la moneda de alojamiento. Migración aditiva nullable.

## REQ-06 — Configuración del desayuno en el catálogo

Se adoptó la tarifa opcional por habitación, huésped y noche, expresada en la moneda de la habitación. El alta y reemplazo rechazan importe no positivo, más de dos decimales, moneda distinta y combinación con BREAKFAST_INCLUDED. La migración aditiva 202611200003_room_breakfast dejó las habitaciones anteriores sin extra. El catálogo incluye la tarifa en el detalle y en su respuesta interna de cotización.

Chrome y Gateway verificaron en un borrador sintético guardar, recargar y retirar 12.000,50 COP conservando el precio de alojamiento de 90.000 COP. Pasaron 276 pruebas unitarias de Accommodations y 25 pruebas web focalizadas, lint y tipos de ambos componentes. La pila local queda activa. Prueba reproducible: node scripts/e2e-breakfast-catalog.mjs con NODE_EXTRA_CA_CERTS apuntando al certificado del gateway.

Siguiente unidad: selección del huésped y cotización versionada en Bookings, persistencia del desglose y verificación de pago, devolución y reporte. Primer comando: Get-Content apps/bookings-service/src/application/create-booking/create-booking.use-case.ts. El cobro del desayuno aún está pendiente.
REQ-06 en curso: cotización y desglose en la reserva. Migración aditiva de Bookings con valores por defecto compatibles con reservas anteriores.
REQ-06: Chrome verificó elección y pago. El reporte LIVE omitió el cobro tras devolverlo; se corrige la lectura de aprobaciones desde el historial de Payments y se repetirá la conciliación.

## REQ-06 — Reserva, pago y reporte verificados en integración

El huésped elige el desayuno antes de confirmar. POST /bookings/quote calcula alojamiento, desayuno y total por estancia. La confirmación contrasta la versión del catálogo, guarda las tarifas y totales y crea el trabajo de pago en la misma transacción. Repetir la clave devuelve la reserva incluso tras cambiar la tarifa y despublicar el inmueble. Se conservó la compatibilidad de los pedidos sin desayuno y se aplicó la migración aditiva 202611200004_breakfast_snapshot.

Chrome, gateway y servicios locales: dos huéspedes, dos noches, 240.000 COP de alojamiento y 60.001 COP de desayuno. Total cobrado y reembolsado 300.001 COP, neto 0 en Reports LIVE. También se verificaron una noche/un huésped, exclusión del desayuno, fechas de cero noches y cero huéspedes rechazados, versión obsoleta y repetición con distinto contenido. Se corrigió la consulta de movimientos de Payments para reconocer la aprobación histórica si approvedAt es nulo.

Pasaron las 346 pruebas web, 96 unitarias y 88 de contrato de Bookings, dos casos adicionales de importes, dos de Gateway y dos de regresión del reporte de Payments. Tipos y lint verificados. Pasarela de desarrollo simulada, servicios locales activos. Reproducible con STAYHUB_TEST_BROWSER=1 y el certificado local mediante node scripts/e2e-verifier-session.mjs.

Siguiente unidad: REQ-01 + REQ-02, país, ciudad y coordenadas. Primer comando: rg -n "COUNTRY_PATTERN|parseLocation|LocationMap|longitude" apps/web/src apps/accommodations-service/src.

REQ-01 parcial. Alta y edición de alojamientos y filtro web de país validan códigos ISO 3166-1 alpha-2 asignados. 26 pruebas del dominio y 34 web aprobadas, tipos de ambos componentes correctos. Chrome contra Vite aceptó CO y AR y rechazó ZZ en el módulo servido. Sin migraciones. Pendiente verificar por gateway tras reconstruir Accommodations y completar ciudades y selector del mapa.
Siguiente comando: rg -n 'countryCode|country_code' apps/search-service/src apps/api-gateway/src. Comprobar contrato del filtro API y compatibilidad con URLs históricas. Esta unidad no inició procesos persistentes.

REQ-01 en curso. Se prepara la reconstrucción local de Search y Accommodations para verificar la validación ISO por gateway.

REQ-01, filtro de país verificado. Search acepta códigos ISO asignados con ambas capitalizaciones. En Chrome, el enlace guardado con countryCode=co mostró alojamientos de Bogotá. El gateway devolvió los mismos identificadores y total para CO y co, y HTTP 400 para ZZ tanto en búsqueda como en el alta por propietario. Prueba reproducible: node scripts/e2e-country-filter.cjs. Pasaron 13 pruebas unitarias y 9 de contrato. Search y Accommodations reconstruidos y saludables.
Siguiente unidad: normalización de ciudades por país y región en sugerencias. Primer comando: rg -n 'normalizeTerms|suggestions|city' apps/search-service/src. El selector de mapa continúa pendiente.

REQ-01: en verificación la agrupación de sugerencias de ciudad por país y región. Reconstrucción local de Search sin migraciones.

REQ-01, sugerencias de ciudad. Search agrupa variantes de tilde y mayúsculas por ciudad, región y país. Cuando hay homónimos añade región y país a la opción. En PostGIS aislado, cuatro alojamientos de prueba generaron tres opciones y sus búsquedas devolvieron respectivamente uno, uno y dos alojamientos. Pasaron 9 pruebas de integración. Chrome mostró la sugerencia Bogota y una tarjeta del catálogo local después de abrir su búsqueda (HTTP 200). Search reconstruido y saludable; sin migración.
Siguiente unidad: selector de coordenadas para alta y edición (REQ-02). Primer comando: rg -n 'LocationMap|property-latitude|property-longitude' apps/web/src. Pendiente comprobar equivalencias en el chatbot.

REQ-02 verificado en integración local. Alta y edición comparten un selector Leaflet con cartografía OpenStreetMap, clic y marcador sincronizado con los campos de coordenadas accesibles por teclado. Sin coordenadas se muestra una vista mundial sin marcador. Chrome creó un borrador sintético por clic, recargó sus coordenadas en edición, guardó 0,0 y comprobó el marcador del detalle; después retiró la ubicación y comprobó el detalle sin mapa. Prueba reproducible: node scripts/e2e-coordinate-picker.mjs. Pasaron 9 pruebas de publicación, lint y tipos web. Sin migración. La carga de teselas depende de OpenStreetMap.
Siguiente unidad: verificar equivalencias de ciudad y país en el chatbot (REQ-01). Primer comando: rg -n 'countryCode|city|location' apps/api-gateway/src/modules/chat. El borrador sintético quedó privado y sin coordenadas; la pila local sigue activa.
