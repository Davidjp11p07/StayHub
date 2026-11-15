# Quickstart de validación futura — Reports Service

Este documento define la evidencia esperada cuando se implemente el plan. Su existencia no implica que el servicio ya esté construido.

## Prerrequisitos

- Node.js 20, npm y Docker Desktop.
- Variables basadas en `.env.example`, sin secretos reales versionados.
- PostgreSQL 16 y RabbitMQ disponibles mediante Docker Compose.
- Productores compatibles de Bookings, Payments y actividad de habitaciones.

## Arranque esperado

1. Instalar dependencias del workspace.
2. Validar el esquema Prisma y ejecutar las migraciones de Reports.
3. Levantar `reports-db`, RabbitMQ, `reports-migrate`, `reports-service` y API Gateway.
4. Confirmar `/health/live`, `/health/ready` y Swagger/OpenAPI.
5. Publicar fixtures contractuales con `eventId` únicos y esperar que `dataAsOf` avance.

Los comandos exactos deberán seguir los scripts reales que se incorporen al `package.json`; no se documentan nombres ficticios como si ya existieran.

## Escenarios mínimos

### Seguridad

- OWNER consulta su `ownerId`: 200.
- OWNER consulta otro propietario: 403.
- ADMIN consulta cualquier propietario: 200.
- GUEST, token vencido, audiencia o scope incorrectos: 401/403 según corresponda.

### Idempotencia y orden

- Publicar dos veces el mismo evento: una sola mutación.
- Reutilizar `eventId` con payload distinto: rechazo auditable.
- Publicar pago antes de reserva: queda diferido y luego se aplica.
- Forzar error transitorio: retry; agotar intentos: DLQ.

### Ingresos

- Pago aprobado de 10000 COP y reembolso de 2500 COP produce 7500 COP.
- COP y USD aparecen en grupos separados.
- `booking.total` sin pago aprobado no se cuenta como ingreso.

### Ocupación

- Dos habitaciones activas durante dos noches y una reserva de una habitación por una noche producen 25 %.
- Una habitación sin reservas permanece en el denominador.
- Cero noches disponibles produce `occupancyRate: null`.
- Si falta el productor real de habitaciones, la respuesta indica cobertura incompleta y la prueba E2E de RQ-12 queda pendiente.

### Rango y tendencias

- `[from,to)` no duplica eventos en límites.
- Día/semana/mes mantienen los mismos totales.
- Rango > 366 días o fechas inválidas: 400 con Problem Details.

## Evidencia requerida

- lint, typecheck, build y pruebas unitarias verdes;
- cobertura >= 70 %;
- integración con PostgreSQL y RabbitMQ reales;
- contratos OpenAPI/JSON Schema validados;
- E2E a través del Gateway;
- perfil reproducible con p95 < 500 ms;
- logs correlacionados y métricas de lag/DLQ;
- revisión humana de trazabilidad con RQ-12.

No se debe declarar ocupación completa con mocks o fixtures únicamente: hace falta comprobar el productor real del contrato de habitaciones y el flujo distribuido.
