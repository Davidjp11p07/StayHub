# Investigación técnica — Reports Service

**Fecha**: 2026-11-15  
**Alcance**: decisiones necesarias para implementar RQ-12 sin diseñar ni implementar otros servicios del Sprint 4.

## 1. Fuente de datos

**Decisión**: Reports mantendrá una proyección PostgreSQL propia consumiendo eventos versionados de RabbitMQ.

**Razón**: respeta la propiedad de datos por microservicio, evita joins entre bases y permite consultas rápidas aunque los servicios fuente no estén disponibles durante la lectura.

**Alternativas descartadas**: consultar sincrónicamente Bookings, Payments y Accommodations en cada reporte (acoplamiento y fallos en cascada); compartir sus bases (viola la constitución); duplicar lógica de negocio mediante llamadas directas no versionadas.

## 2. Persistencia y consultas

**Decisión**: PostgreSQL 16 y Prisma 6.19, siguiendo el repositorio. Prisma administrará conexión/migraciones; las agregaciones complejas podrán usar SQL parametrizado mediante `Prisma.sql`/`$queryRaw`, nunca interpolación insegura.

**Razón**: Prisma ya es el ORM adoptado y PostgreSQL resuelve agrupaciones temporales e índices sin otro motor.

**Alternativas descartadas**: introducir TypeORM; Elasticsearch para métricas relacionales; SQL concatenado; lectura desde bases ajenas.

## 3. Caché y rollups

**Decisión**: no usar Redis ni vistas materializadas en el MVP. Primero se medirán consultas indexadas, con rango máximo de 366 días.

**Razón**: no existe evidencia de que PostgreSQL incumpla p95 < 500 ms y una caché agregaría invalidación, infraestructura y consistencia.

**Alternativas**: Redis o rollups diarios solo después de un perfil reproducible que demuestre la necesidad.

## 4. Semántica de ingresos

**Decisión**: ingreso reconocido = pagos aprobados menos reembolsos confirmados, agrupado por moneda y fecha del evento financiero. No se suman monedas diferentes.

**Razón**: el total de una reserva no prueba que el dinero se haya recibido; Payments es la autoridad financiera.

**Alternativas descartadas**: usar `booking.total` como ingreso; conversión FX implícita; contar pagos pendientes o fallidos.

## 5. Semántica de ocupación

**Decisión**: `noches ocupadas / noches disponibles * 100`, por intersección de `[checkIn, checkOut)` con `[from, to)`. El denominador incluye cada habitación activa durante cada noche del periodo. Si no hay noches disponibles, la tasa es `null`.

**Razón**: usar solo habitaciones con reservas sobrestima la ocupación y no satisface RQ-12.

**Dependencia descubierta**: los eventos actuales de Bookings identifican habitaciones reservadas, pero no las habitaciones activas sin reservas. Accommodations debe producir `accommodation.v1.room-reporting-upserted` (o un equivalente formalmente versionado). Hasta entonces, `coverage.complete=false` y el criterio de ocupación no puede declararse integrado.

**Alternativas descartadas**: inventar el denominador; consultar la base de Accommodations; asumir capacidad constante sin contrato.

## 6. Resumen, cancelaciones y tendencias

**Decisión**: el resumen contará reservas por estado, cancelaciones y series agrupadas por día/semana/mes. Los límites temporales son UTC y semiabiertos `[from, to)`.

**Razón**: evita doble conteo en fronteras y ofrece las métricas expresas de RQ-12 sin añadir analítica predictiva.

## 7. Seguridad e identidad

**Decisión**: Gateway emitirá el JWT delegado interno ya usado por el repositorio, con `sub`, `role`, `aud`, `scope` y expiración corta. Reports verificará firma, audiencia, alcance y rol. OWNER solo puede solicitar su propio `ownerId`; ADMIN puede consultar cualquiera; GUEST recibe 403.

**Razón**: Gateway no sustituye la autorización del servicio y no se debe confiar en encabezados manipulables.

**Alternativas descartadas**: autorización solo en Gateway; `ownerId` confiado desde headers; token público reenviado sin validar el contrato interno.

## 8. Entrega, duplicados y orden de eventos

**Decisión**: cola durable propia, publisher confirms en productores, ack después del commit, inbox por `eventId` y hash, retry con backoff, DLQ y almacenamiento de eventos diferidos cuando falta una dependencia anterior.

**Razón**: RabbitMQ entrega al menos una vez y eventos de Payments pueden llegar antes del evento de Booking correspondiente.

**Alternativas descartadas**: ack antes de persistir; deduplicación en memoria; descartar silenciosamente eventos desordenados.

## 9. Frescura y salud

**Decisión**: toda respuesta expondrá `dataAsOf` y estado de cobertura. Liveness solo comprueba el proceso; readiness exige PostgreSQL y puede reportar degradación por RabbitMQ/backlog sin ocultar datos ya proyectados.

**Razón**: la consistencia es eventual y el consumidor debe distinguir un cero real de información atrasada o incompleta.

## 10. Contratos y pruebas

**Decisión**: OpenAPI 3.1 para lectura, JSON Schema para eventos, pruebas unitarias de fórmulas, integración con PostgreSQL/RabbitMQ reales, pruebas de contrato y E2E por Gateway. Cobertura mínima 70 % y perfil que demuestre p95 < 500 ms.

**Razón**: estas evidencias cumplen constitución y RNF sin confundir mocks con integración real.

## Conclusión

No quedan decisiones técnicas abiertas para iniciar el servicio. Existe una dependencia externa explícita: el contrato real de actividad de habitaciones. Puede desarrollarse en paralelo contra fixtures contractuales, pero RQ-12 no se marca completamente integrado hasta validar un productor real y el E2E distribuido.
