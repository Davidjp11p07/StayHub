# Data model
## ReportSnapshot (Reports)
key texto hash SHA256 único del propietario/filtros; ownerId UUID obligatorio sin FK externa; payload JSON sin PII; generatedAt timestamptz; índice(ownerId,generatedAt). Upsert conserva último resultado por ámbito; no almacena cada visita indefinidamente.
## ReportSupplyVersion (Alojamientos)
id bigint identity primario; propertyId/ownerId UUID sin FK para preservar historia; capturedAt timestamptz; name texto; roomIds JSON UUIDs de habitaciones publicadas (vacío si no publicado); índice(ownerId,capturedAt,id). Baseline al migrar y nueva versión transaccional en create/replace. Inmutable.
## Hechos
Booking: id,ownerId,propertyId,roomId,status,createdAt,cancelledAt nullable,checkIn,checkOut. Sin guestId.
Movement: id único charge/refund, bookingId,kind CHARGE/REFUND,currency COP/USD,amountMinor string entero no negativo,occurredAt.
Supply: id string bigint,propertyId,name,capturedAt,roomIds.
## Resultados
ámbito,generatedAt,source LIVE/DEMO; reservas creadas/estado, cancelaciones por fecha (y tasa de cancelación de cohorte creada); dinero por moneda; ocupación nullable con motivo/completitud y futuro proyectado; series completas día/mes; comparación anterior de igual duración; propiedades para filtro.
