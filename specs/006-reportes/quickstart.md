# Reports: validación local

Servicio en puerto 3011; Swagger en http://localhost:3011/docs (desarrollo).
Panel React en `/host/reports` y `/admin/reports`, mediante Gateway y sesión autenticada.
OWNER consulta sus datos; ADMIN selecciona propietario. Fechas UTC `[from,to)`.

## Ejecutar demostración aislada

```sh
npm run dev:reports:demo:up
npm run seed:reports:demo
npm run token:reports:demo
npm run test:reports:smoke -- --restart
node scripts/reports-supply-smoke.mjs
```

El token sirve para Swagger. El panel usa el inicio de sesión habitual; ver el README
de Reports para conectar el entorno local al Gateway y elegir el propietario demo.
Los datos y credenciales demo están separados del entorno principal.

## Evidencia del 15 de noviembre de 2026

- Reports: 58 pruebas, siete suites; cobertura de sentencias 89,72 %, superior al umbral 70 %.
- Contratos fuente: siete pruebas entre Bookings, Payments y Accommodations.
- Delegación Gateway: dos pruebas. Panel React: seis pruebas.
- Lint, tipos, compilación y validación OpenAPI de Reports aprobados.
- Lint y compilación de producción del frontend aprobados; tipos de las fuentes aprobados.
- Imágenes Docker reconstruidas; migraciones terminadas y servicios saludables.
- Smoke HTTP real: autorización, aislamiento de propietario, tres consultas,
  ingresos COP y USD separados, dos reservas, ocupación 40 % y snapshot PostgreSQL.
- Reinicio de Reports y su PostgreSQL: snapshots y resultados conservados.
- Historial de oferta con API real: crear, publicar y despublicar; versiones inmutables,
  conflicto sin escritura y rechazo de identidad de servicio no autorizada.
- `git diff --check` aprobado.

Son 73 pruebas automatizadas más las verificaciones Docker. No se ejecutó una
revisión visual en navegador ni el CI remoto; la revisión de equipo y publicación
siguen siendo pasos externos a esta validación local.

## Interpretación

Ocupación sobre habitaciones publicadas, sin camas ni bloqueos de Inventario.
El pasado sin historial se muestra como no disponible; el futuro es proyección.
Ingresos por fecha de cada movimiento confirmado y moneda; los reembolsos requieren
estado COMPLETED. Nunca se combinan COP y USD. Una fuente caída produce error explícito.
