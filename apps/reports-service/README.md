# Reports Service

Servicio de estadísticas de StayHub en **3011**. Sigue la separación de dominio, aplicación e infraestructura de los servicios existentes. Consulta Bookings, Payments y Alojamientos por contratos REST autenticados; conserva el último resultado por ámbito en `reports_db`. No lee bases de otros servicios.

## Funcionalidades

- Reservas creadas y desglose por estado, cancelaciones ocurridas y tasa de cancelación de la cohorte creada.
- Cobrado, reembolsado y neto, separados por COP/USD y fecha de movimiento confirmado.
- Ocupación reservada por habitación y noche sobre oferta publicada, con historial y estado de completitud.
- Series diarias/mensuales, comparación de reservas con el período anterior de igual duración y filtros por fechas/alojamiento.
- Panel React en `/host/reports` y `/admin/reports`: indicadores, tendencias, ingresos por moneda, tablas accesibles, errores, carga y ausencia de actividad.
- OWNER solo consulta sus datos; ADMIN debe indicar propietario. Autenticación RS256 directa o delegada por Gateway; scope interno `reports:read` exclusivo de `reports-service`.

## API

| Operación | Filtros |
|---|---|
| `GET /reports/owner/:id` | `from`, `to`, `group=day|month`, `propertyId` opcional |
| `GET /reports/occupancy` | mismos filtros; `ownerId` obligatorio para ADMIN |
| `GET /reports/revenue` | mismos filtros; `ownerId` obligatorio para ADMIN |

Las tres operaciones devuelven un reporte coherente con resumen, detalle, series, comparación y metadatos. Swagger está disponible en `/docs` con `NODE_ENV=development`. El Gateway publica las consultas bajo `/api/v1/reports`.

Fechas UTC `YYYY-MM-DD`, intervalo **[from,to)**, máximo 366 noches. `to` no se incluye. Los importes se expresan como strings enteros en unidades menores (100 unidades menores = 1 COP/USD). No se convierten monedas. Un reembolso posterior afecta su propio período, aunque el cobro sea anterior. Neto negativo es válido.

## Ocupación: interpretación

Numerador: noches únicas de habitación con reservas CONFIRMED, CHECKED_IN o COMPLETED. El día de salida no cuenta. Denominador: noches de habitaciones publicadas según el historial de Alojamientos, evaluado al inicio del día UTC. Una habitación para cuatro huéspedes sigue siendo una habitación.

La nueva migración conserva un baseline desde su ejecución; crear o reemplazar propiedades registra versiones en la misma transacción. No reconstruye disponibilidad anterior. Si falta evidencia, la tasa es `null` con motivo explícito; si no hay capacidad, no se divide por cero. Las fechas futuras se identifican como proyección. Esta métrica no incorpora bloqueos del futuro servicio de Inventario.

## Demostración aislada con Docker

Desde la raíz, con Docker y Node 20:

```powershell
npm ci --prefix apps/reports-service
npm run dev:reports:demo:up
npm run seed:reports:demo
npm run test:reports:smoke -- --restart
```

Este entorno usa **los servicios reales**, con bases, red, credenciales y volúmenes propios del proyecto `stayhub-reports-demo`. Los resultados llevan `source: DEMO`. No modifica datos de la plataforma existente.

Swagger: **http://localhost:3011/docs**. Genera un token de cinco minutos con `npm run token:reports:demo`, pégalo en Authorize y consulta propietario `11111111-1111-4111-8111-111111111111`, fechas `2026-11-01` a `2026-11-11`. El seed es repetible sin duplicados. Puede usarse `REPORTS_DEMO_OWNER_ID` con un UUIDv4 diferente antes de sembrar.

Resultado conocido: dos reservas, ocupación 40 % (4/10 noches), COP cobrado `4000000`, reembolsado `1000000`, neto `3000000`; USD neto `1000`, todo en unidades menores.

```powershell
# Detener conservando los datos
npm run dev:reports:demo:down
```

## Integración con la plataforma y el panel

Con `.env` y los secretos del Compose principal ya configurados mediante el procedimiento de desarrollo existente:

```powershell
npm run dev:reports:up
```

Combina `docker-compose.yml` con `docker-compose.reports.integration.yml`. Usa identidades de Auth/Gateway existentes y genera una clave dedicada de lectura para las tres fuentes, sin rotar sus credenciales. Los datos son `source: LIVE`. Detén la demostración si ocupa el mismo puerto 3011.

Para abrir el React existente contra el Gateway HTTPS de Docker:

```powershell
$env:WEB_GATEWAY_URL='https://127.0.0.1:8080'
$env:WEB_GATEWAY_TLS_VERIFY='false' # solo proxy local con certificado de desarrollo
npm run dev:web
```

Inicia sesión con un propietario y usa **Ver reportes** en su panel. Un administrador accede desde **Reportes** en el menú y elige el UUID del propietario. No se habilita acceso anónimo ni se introducen credenciales de demostración en el frontend.

## Desarrollo y verificación

Reports tiene instalación independiente y cliente Prisma propio:

```powershell
npm ci --prefix apps/reports-service
npm run prisma:reports:generate
npm run test:reports:coverage
npm run lint:reports
npm run typecheck:reports
npm run build:reports
npm run openapi:reports:check
```

Configuración: `REPORTS_DATABASE_URL` (solo `reports_db`), `REPORTS_MODE=LIVE|DEMO`, `REPORTS_TIMEOUT_MS`; prefijos `REPORTS_USER_`, `REPORTS_GATEWAY_`, `REPORTS_BOOKINGS_`, `REPORTS_PAYMENTS_`, `REPORTS_ACCOMMODATIONS_` con `ISSUER`, `AUDIENCE`, `KID`, `KEY` o `KEY_FILE`. Las tres fuentes también requieren `URL`. Las claves de usuario/Gateway son públicas; las salientes son privadas. Las fuentes aceptan el firmante dedicado mediante `REPORTS_SOURCE_PUBLIC_KEY_FILE`.

Cada fuente tiene límite de 10 000 hechos; Bookings/Alojamientos paginan de 200 en 200 y Payments consulta hasta 200 reservas por lote. El exceso o un fallo de fuente devuelve 503; no se entrega un total truncado ni se reemplaza con ceros. `/health/ready` comprueba la tabla de resultados y `/health/live` comprueba el proceso.

Contratos, decisiones y evidencia: [specs/006-reportes](../../specs/006-reportes/). CI está definido en `.github/workflows/reports.yml`; su ejecución remota y revisión del equipo son comprobaciones distintas de la validación local.
