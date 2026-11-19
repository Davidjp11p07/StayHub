# Internal source contracts v1
Bearer RS256, issuer/audience/kid propios de fuente, sujeto reports-service y scope reports:read. No publicar en Gateway.
## Bookings
GET /internal/v1/reports/bookings?ownerId=uuid&after=uuid&limit=200
{items:[{id,ownerId,propertyId,roomId,status,createdAt,cancelledAt,checkIn,checkOut}],nextCursor:string|null}. Siempre ownerId antes de paginar por id asc. Todas las fechas para vincular reembolsos de reservas antiguas.
## Payments
POST /internal/v1/reports/movements {bookingIds:uuid[1..200],from:YYYY-MM-DD,to:YYYY-MM-DD}; máximo732 días para comparación.
{items:[{id,bookingId,kind,currency,amountMinor,occurredAt}]}. CHARGE approvedAt; REFUND primera transición COMPLETED. Sin PII. Exceso explícito503, sin truncado silencioso.
## Alojamientos
GET /internal/v1/reports/supply?ownerId=uuid&after=bigint&limit=200
{items:[{id,propertyId,name,capturedAt,roomIds}],nextCursor:string|null}. Orden id asc; primera captura establece inicio de evidencia de cada propiedad. No implica disponibilidad previa.
## Errores
400 entrada inválida;401 token inválido;403 sujeto/scope incorrectos;503 fuente o volumen no procesable. Swagger de cada fuente incluye nuevos contratos.
