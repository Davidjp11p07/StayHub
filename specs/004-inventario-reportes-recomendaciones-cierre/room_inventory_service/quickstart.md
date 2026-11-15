# Quickstart de validación futura — Room Inventory Service

Esta guía describe evidencia esperada después de implementar el plan; no afirma que el servicio exista todavía.

## Prerrequisitos

- Node.js 20, npm y Docker Desktop.
- Variables derivadas de `.env.example`, sin secretos reales versionados.
- PostgreSQL 16, API Gateway y Accommodations disponibles en Compose.
- Provider real `GET /internal/v1/rooms/{roomId}/inventory-context` o stub solo para desarrollo temprano.

## Arranque esperado

1. Instalar dependencias del monorepo.
2. Validar/generar Prisma y ejecutar migración desde DB vacía.
3. Levantar `inventory-db`, migración, `room-inventory-service`, Accommodations y Gateway.
4. Confirmar `/health/live`, `/health/ready` y Swagger.
5. Obtener tokens OWNER/ADMIN y una habitación real del propietario.

Los comandos exactos deben corresponder a los scripts que finalmente se incorporen a `package.json`; no se documentan comandos ficticios como si ya existieran.

## Escenarios mínimos

### Lectura

- Habitación propia sin inventario: 200, `version=0`, `items=[]`.
- Habitación propia con items: 200 y contrato completo.
- OWNER ajeno: 403; GUEST: 403; habitación inexistente/oculta: 404.
- Accommodations no disponible: 503, sin filtrar datos locales como autorizados.

### Creación

- Agregar PRODUCT con cantidad 10: 201, UUID y versión incrementada.
- Agregar SERVICE con cantidad 0/activo: comportamiento conforme al contrato.
- Tipo, nombre o cantidad inválidos: 400/422 sin escritura parcial.
- Item 201 excede el límite: rechazo sin cambio de versión.

### Reemplazo y concurrencia

- PUT correcto actualiza items y aumenta una versión.
- Omisión deja el item inactivo, no lo borra.
- PUT idéntico/replay devuelve el estado actual sin otro incremento.
- Dos PUT con la misma versión: uno gana y el otro recibe 409.
- ID desconocido: 400 y rollback completo.

### Seguridad y operación

- JWT con firma/audience/scope/rol inválidos: 401/403.
- Headers `x-user-id`/`x-role` no sustituyen claims.
- Logs no incluyen token, nombre de item ni cuerpo.
- Reinicio/shutdown no deja conexiones abiertas.

## Evidencia requerida

- OpenAPI público y contrato Accommodations válidos;
- lint, typecheck, build, tests y cobertura >= 70 %;
- PostgreSQL real para migración/transacciones/concurrencia;
- provider Accommodations real y E2E mediante Gateway;
- p95 < 500 ms y error < 1 % para GET con 200 items;
- Compose, health, no-root y shutdown verificados;
- revisión de alcance contra el criterio del Sprint 4.

Los stubs permiten desarrollo, pero no demuestran ownership distribuido ni integración completa.
