# Research: Reports
## Fuentes
Decision: REST interno dedicado con reports:read. Bookings ya restringe history a OWNER. Payments conoce bookingId pero no ownerId: obtener IDs autorizados de Bookings antes de consultar movimientos por lotes.
Rationale: independencia de bases y permisos; no cambiar comandos de reserva/pago.
Alternatives: SQL cruzado viola constitución; proyección RabbitMQ requiere nuevos contratos y reconciliación para una consulta síncrona.
## Ocupación
Decision: historial inmutable de oferta publicada en Alojamientos dentro de create/replace, baseline al migrar. Una habitación es una unidad; CONFIRMED/CHECKED_IN/COMPLETED consumen noches [checkIn,checkOut). Sin evidencia histórica, tasa null con motivo; futuro proyectado.
Rationale: no existe disponibilidad histórica en modelo actual. No equivale a inventario con bloqueos.
Alternatives: usar habitaciones actuales para todo el pasado produce porcentajes engañosos.
## Dinero
Decision: approvedAt para cobros (incluidos después reembolsados), primera transición COMPLETED para reembolsos. Enteros exactos por moneda. Neto de movimientos del período, puede ser negativo.
## UI y operación
Decision: React y Gateway existentes, gráficos SVG accesibles con tablas; Docker local con migraciones, salud, volúmenes y secretos ignorados. Fixtures demo explícitos en entorno separado.
Investigación: modelos, guardas JWT, cliente delegado Gateway, React, Compose y scripts revisados desde agente principal. Los agentes de investigación no pudieron acceder a herramientas; sus sugerencias no se trataron como evidencia del código.
