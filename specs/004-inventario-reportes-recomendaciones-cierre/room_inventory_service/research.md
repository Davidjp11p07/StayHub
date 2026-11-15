# Investigación técnica — Room Inventory Service

**Fecha**: 2026-11-15  
**Alcance**: decisiones necesarias para el entregable de inventario del Sprint 4.

## 1. Trazabilidad del producto

**Decisión**: trazar la feature al objetivo, microservicio, tarea y criterio de aceptación de inventario del Sprint 4; no vincularla a RQ-12/RQ-13.

**Rationale**: `tendencias.md` describe explícitamente Inventory, pero la tabla numerada no le asigna un RQ. RQ-12 es Reports y RQ-13 Recommendations.

**Alternatives considered**: inventar RQ-14 o reutilizar RQ-12; ambas falsearían la fuente de verdad.

## 2. Límite del dominio

**Decisión**: Inventory controla productos/servicios y cantidades por habitación. Accommodations controla habitación/propiedad; Bookings controla disponibilidad por fechas.

**Rationale**: evita tres fuentes de verdad para la misma habitación y respeta los límites ya implementados.

**Alternatives considered**: mover Room a Inventory; duplicar bloqueos de reserva; ampliar a consumo/cobro del huésped. Todas exceden el documento.

## 3. Semántica mínima del item

**Decisión**: `type=PRODUCT|SERVICE`, nombre, cantidad disponible y activo. Servicios usan cantidad como cupos genéricos; agendas y franjas quedan fuera.

**Rationale**: son los datos mínimos para representar “productos y servicios disponibles” y verificar que el inventario se actualiza.

**Alternatives considered**: precios, SKU, proveedor, unidad de medida, stock mínimo y calendario; no están autorizados por la fuente.

## 4. Semántica de PUT

**Decisión**: reemplazo completo versionado. Actualiza IDs conocidos, los omitidos quedan inactivos, desconocidos se rechazan y no hay hard delete. Replay de un estado ya aplicado devuelve 200 sin incrementar versión.

**Rationale**: hace concreto el endpoint definido, evita actualizaciones perdidas y conserva trazabilidad sin agregar endpoints PATCH/DELETE.

**Alternatives considered**: patch parcial (no coincide con PUT); last-write-wins (pierde cambios); borrado físico por omisión (destructivo).

## 5. Persistencia

**Decisión**: PostgreSQL 16 propio y Prisma 6.19, con agregado `RoomInventory` y `InventoryItem` en transacción.

**Rationale**: es el ORM realmente adoptado y permite control optimista/constraints sin introducir otra tecnología.

**Alternatives considered**: TypeORM, base compartida con Accommodations, documento JSON único. Se descartan por inconsistencia, acoplamiento o consultas/constraints débiles.

## 6. Integración con Accommodations

**Decisión**: REST interno `GET /internal/v1/rooms/{roomId}/inventory-context` con service JWT y respuesta mínima de room/property/owner/status.

**Rationale**: la escritura requiere una respuesta autoritativa inmediata y el repositorio carece de evento/consulta por roomId. Es más pequeño que replicar todo el catálogo.

**Alternatives considered**: consultar DB ajena (prohibido); confiar en ownerId del cliente (inseguro); crear eventos y bootstrap de proyección (complejidad sin necesidad actual); pedir propertyId públicamente (rompe endpoint documentado).

**Compatibility finding**: Accommodations usa hoy un único scope configurado para Booking Quote. El nuevo endpoint debe validar `accommodations:inventory-context` de forma específica y conservar pruebas de regresión para `accommodations:booking-quote`; no se reutiliza ni se reemplaza el scope existente.

## 7. RabbitMQ y Redis

**Decisión**: no usarlos en el MVP.

**Rationale**: no existe workflow asíncrono ni consumidor autorizado, y las lecturas por PK con máximo 200 items no justifican caché.

**Alternatives considered**: publicar `inventory.updated` o cachear GET. Solo se reevaluará con un consumidor real o evidencia de rendimiento.

## 8. Seguridad

**Decisión**: JWT delegado RS256 Gateway → Inventory con `sub`, `role`, audience y scope; service JWT Inventory → Accommodations. Inventory comprueba ownership aunque Gateway proteja la ruta.

**Rationale**: seguridad en profundidad y patrón ya usado por Gateway/Bookings/Accommodations.

**Alternatives considered**: bearer público reenviado sin contrato; headers de identidad; autorización exclusiva en Gateway.

## 9. API Gateway

**Decisión**: usar el Gateway NestJS real del repositorio, su cliente base, circuito, Problem Details y token delegado.

**Rationale**: tras el merge actual no existe Kong/Nginx como implementación de aplicación; introducirlo sería una segunda arquitectura.

## 10. Límites operativos

**Decisión**: 200 items por habitación, nombre 1..120, cantidad entera 0..1 000 000 y body acotado.

**Rationale**: protege memoria/SQL, permite el RNF de 500 ms y es holgado para el MVP.

**Alternatives considered**: ilimitado; paginación. Paginación no aporta valor para el tamaño acotado y alteraría el contrato principal.

## 11. Validación

**Decisión**: unitarias de dominio; PostgreSQL real para migración, transacción y concurrencia; contrato provider-consumer; seguridad; performance; E2E Gateway → Inventory → Accommodations.

**Rationale**: cumple constitución y diferencia mocks de integración distribuida real.

## Conclusión

El servicio puede comenzar con contratos y stubs. La única dependencia externa de implementación es el provider de contexto de habitación en Accommodations; hasta comprobarlo, ownership distribuido y E2E quedan pendientes explícitamente.
