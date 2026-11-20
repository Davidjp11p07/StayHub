# Auditoría de la web StayHub

Fecha: 2026-11-19. Rama inspeccionada: `local/stayhub-integracion`, commit `e20ec6b`.

> Estado posterior: esta auditoría conserva los hallazgos del momento de su elaboración. La rama local contiene cambios posteriores para listados, fotos, pago, perfil, inventario y chat; su ejecución integrada aún requiere verificación y reconstrucción de los servicios modificados.

### Seguimiento de implementación local

Se implementaron en código los listados del huésped y del anfitrión, la descarga de fotos visibles, una pantalla de perfil con subida de foto, una vista básica de inventario, la aclaración del pago simulado, el acceso del chat a reservas recientes, la validación de fechas de reportes, la base común de API y una página 404. También se retiró del detalle de alojamiento un panel antiguo que creaba reservas solo en el navegador. Estos cambios tienen pruebas focalizadas, pero los contenedores en ejecución conservan las imágenes anteriores y no se han verificado los nuevos flujos con datos reales.

Quedan pendientes, entre otros, la producción confiable de eventos de Accommodations hacia Search, paginación del listado de propiedades, gestión completa de fotos, filtros de historial por propiedad, recuperación de contraseña, notificaciones en la web, integración de disponibilidad/bloqueos con reportes, actualización de contratos OpenAPI y pruebas completas con sesiones reales. La disponibilidad de Search no se debe asumir hasta verificar su proyección.

## Resumen

- La web, el gateway y la búsqueda responden; el frontend y los diez servicios tienen infraestructura local disponible.
- Las diez bases PostgreSQL de Auth, Users, Accommodations, Search, Bookings, Payments, Reviews, Notifications, Reports e Inventory están saludables en Docker; sus puertos no se publican al host.
- «Mis reservas» del huésped y «Mis propiedades» dependen de listados que no existen en este gateway; los GET anónimos devolvieron 404.
- La pantalla de pago simulado puede afirmar una confirmación sin consultar el estado posterior de Bookings.
- Hay rutas de perfil y de inventario en el gateway, pero no pantallas para gestionarlos; Notifications permanece interno.
- Los módulos de Reports, Inventory y Chat están presentes en esta rama de integración local; esto no implica que estén aprobados o fusionados en `main`.
- El chat muestra explicaciones y consulta reservas por ID; tiene límites en detección de preguntas privadas y tasas fijas.
- No hay herramienta de navegador disponible en esta sesión: la auditoría de flujos es estática y mediante GET, no una prueba visual o autenticada de extremo a extremo.
- No se crearon cuentas, propiedades, reservas ni otros datos. No se modificaron código, contenedores ni ramas.

## Alcance y comprobaciones

Fecha y alcance: código del directorio de integración local, sus controladores y configuración, más GET al entorno existente. `GET /health/live`, `GET /health/ready`, `GET /api/v1/search` y la página web respondieron 200; `GET /api/v1/bookings` y `GET /api/v1/properties?mine=true`, sin sesión, respondieron 404. La ausencia de estos listados se confirma además por los controladores; la respuesta anónima por sí sola no demuestra permisos autenticados. No se enviaron POST, PATCH, PUT ni DELETE. Registro, inicio y cierre de sesión, foto de perfil, creación y edición de alojamientos, reservas, cancelación, reseñas, reportes, inventario y chat no se verificaron en navegador ni con usuarios reales. Los fallos de esos flujos señalados abajo son conclusiones de código, no resultados de una ejecución visual.

Inventario de contenedores: `auth-db`, `users-db`, `accommodations-db`, `search-db`, `bookings-db`, `payments-db`, `reviews-db`, `notifications-db`, `reports-db` e `inventory-db` muestran `healthy` con PostgreSQL 5432 interno. Los diez contenedores de migración correspondientes terminaron con código 0. Para verlos en Docker Desktop, buscar el proyecto `stayhub-integracion-local`; no están publicados como puertos de base de datos al host. No se verificaron contenidos de tablas ni acceso externo.

Las rutas siguientes llevan prefijo `/api/v1`. «Existe» significa que el controlador del gateway declara la ruta, no que su flujo autenticado se haya probado. Fuentes generales: `apps/web/src/app/routes.tsx:127`, `apps/web/src/app/navigation.ts:5` y controladores en `apps/api-gateway/src/modules/`.

## Inventario de pantallas y llamadas

| Pantalla / ruta | Llamadas principales y servicio | Estado en gateway / observación |
| --- | --- | --- |
| Inicio `/` | `GET /search` (Search); búsqueda navega a `/search` | Existe; datos reales no inspeccionados. `pages/Home.tsx:28`. |
| Buscar `/search` | `GET /search`, `GET /search/suggest` (Search) | Existen. `api/search.ts:111`. |
| Detalle `/property/:id` | `GET /properties/:id` (Accommodations), `GET /properties/:id/reviews` (Reviews), posible GET de foto | Detalle y reseñas existen; descarga de foto por ruta generada no declarada. `pages/PropertyDetail.tsx:62`, `api/properties.ts:83`. |
| Registro `/register` | `POST /auth/register` (Auth) | Existe; flujo no probado. `api/identity.ts:44`. |
| Acceso `/login` | `POST /auth/login`, `GET /auth/validate`, `GET /users/:id/profile` (Auth, Users) | Existen; flujo no probado. `api/session.ts:115`. |
| Cabecera global | `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/validate`, `GET /users/:id/profile` | Existen. No hay pantalla de perfil/foto. `components/Header.tsx:34`, `api/session.ts:72`. |
| Mis reservas `/bookings` | `GET /bookings` (Bookings) | No existe listado GET en el gateway; GET anónimo 404. `api/bookings-history.ts:78`. |
| Mis reseñas `/reviews` | `GET /reviews/user/:userId` (Reviews) | Existe; no probado con sesión. `api/reviews.ts:78`. |
| Reservar `/property/:id/book` | `GET /properties/:id`, `POST /bookings` (Accommodations, Bookings) | Existen; POST requiere sesión GUEST e idempotencia. `pages/booking/Booking.tsx:31`. |
| Pagar `/booking/:bookingId/pay` | `GET /bookings/:id`; pago simulado local (Bookings) | GET existe; no hay pago público por diseño. `pages/booking/Payment.tsx:35`. |
| Cancelar `/bookings/:bookingId/cancel` | `GET /bookings/:id`, `DELETE /bookings/:id` (Bookings) | Existen; no probado autenticado. `api/bookings-cancel.ts:26`. |
| Escribir reseña `/bookings/:bookingId/review` | `GET /bookings/:id`, `POST /reviews` (Bookings, Reviews) | Existen; elegibilidad y creación no probadas. `pages/booking/ReviewProperty.tsx:30`. |
| Panel `/host` | Datos de sesión y navegación | Sin petición de negocio propia; OWNER. `pages/host/HostHome.tsx:9`. |
| Crear `/host/new` | `POST /properties`, `POST /properties/:id/photos`, `PUT /properties/:id` para publicar (Accommodations) | Existen; escritura no probada. `pages/host/PublishProperty.tsx:78`. |
| Mis propiedades `/host/properties` | `GET /properties?mine=true` (Accommodations) | No existe listado GET en gateway; GET anónimo 404. `api/properties.ts:60`. |
| Editar `/host/properties/:id/edit` | `GET /properties/:id`, `PUT /properties/:id` (Accommodations) | Existen; no probado autenticado. `pages/host/EditProperty.tsx:83`. |
| Reservas recibidas `/host/bookings` | `GET /bookings/history` (Bookings) | Existe para OWNER; no probado con sesión. `pages/host/BookingsReceived.tsx:19`. |
| Reportes `/host/reports`, `/admin/reports` | `GET /reports/owner/:id` (Reports) | Existe con autorización OWNER/ADMIN; no probado con sesión. `api/reports.ts:19`, `modules/reports/reports-proxy.module.ts:22`. |
| Chat global | `POST /chat` (gateway/Ollama/Search/Accommodations/Reviews); `GET /bookings/:id` (Bookings privado) | Rutas declaradas; no se probó POST ni sesión. `components/ChatWidget.tsx:80`. |
| Perfil y foto | No existe pantalla dedicada; la sesión lee `GET /users/:id/profile` (Users) | Gateway declara GET/PATCH de perfil y GET de foto; no hay carga de foto en gateway. `modules/users/profile.controller.ts:69`, `profile-photo.controller.ts:34`. |
| Inventario de habitación | No existe pantalla ni cliente web de Inventory | Gateway declara GET/POST/PUT de `/inventory/rooms/:roomId`; no se verificaron escrituras ni flujo de propietario. `modules/inventory/inventory.controller.ts:24`. |
| Notificaciones | No existe pantalla ni cliente web de Notifications | Servicio interno; no hay rutas de notificaciones en el gateway. `apps/api-gateway/src/app.module.ts`. |
| Ruta desconocida | `*` redirige a `/` | No presenta página 404. `app/routes.tsx:173`. |

## Auth

- **AUTH-01 — Recuperación de contraseña no visible.** La pantalla de acceso solo solicita correo y contraseña y el cliente de identidad declara registro, login, refresh y logout; no se encontró flujo de recuperación en la web. Evidencia: `pages/Login.tsx:15`, `api/identity.ts:43`. Mejora: añadir recuperación segura en una fase posterior, una vez exista contrato de Auth; no se afirma que el backend completo carezca de ella. **Prioridad:** media. **Esfuerzo:** L. **Compartidos:** potencialmente `app.module.ts`, `gateway-config.ts`, `.env.example`; coordinar antes.
- **AUTH-02 — Compatibilidad de sesión con Web Locks.** `session.ts:47` falla con 503 si `navigator.locks` no existe; puede impedir restaurar o cerrar sesión en navegadores sin esa API. Mejora: probar navegadores objetivo y diseñar alternativa segura con exclusión entre pestañas. **Prioridad:** media. **Esfuerzo:** M. **Compartidos:** no.

## Users

- **USR-01 — Perfil y foto sin interfaz.** La sesión carga nombre/correo, pero no existe ruta ni formulario de edición en la web. El gateway declara `GET/PATCH /users/:id/profile` y solo GET de foto; no se declara subida de foto. Evidencia: `api/session.ts:72`, `app/routes.tsx:127`, `modules/users/profile.controller.ts:69`, `profile-photo.controller.ts:34`. Mejora: permitir ver/editar perfil y definir con Users y gateway la subida de foto autenticada. **Prioridad:** alta. **Esfuerzo:** M. **Compartidos:** probablemente `app.module.ts` si se añade controlador; revisar contrato.

## Accommodations

- **ACC-01 — Mis propiedades no tiene listado real.** La web llama `GET /properties?mine=true`; el controlador solo declara POST, GET por ID, PUT por ID y POST de foto. GET anónimo del listado devolvió 404. Evidencia: `api/properties.ts:56`, `modules/accommodations/accommodations.controller.ts:61`. Mejora: listado paginado por propietario con autorización en servicio y proxy. **Prioridad:** alta. **Esfuerzo:** M. **Compartidos:** posiblemente `app.module.ts`, `gateway-config.ts` o contrato compartido; coordinar.
- **ACC-02 — Foto de propiedad puede apuntar a ruta inexistente.** Si `photo.url` falta, `photoUrl` genera `GET /properties/:id/photos/:photoId`; el controlador del gateway no declara ese GET. No se inspeccionó una foto publicada real, por tanto no se afirma que todas las imágenes fallen. Evidencia: `api/properties.ts:83`, `modules/accommodations/accommodations.controller.ts:87`. Mejora: exponer URL o descarga autenticada/pública según visibilidad y probar una foto real. **Prioridad:** alta. **Esfuerzo:** M. **Compartidos:** posible contrato/rutas del gateway.
- **ACC-03 — Edición de fotos incompleta.** La edición de propiedad indica que las fotos no se gestionan allí; el gateway expone carga pero no eliminación ni reordenación en ese controlador. Evidencia: `pages/host/EditProperty.tsx:21`, `modules/accommodations/accommodations.controller.ts:87`. Mejora: incorporar gestión de fotos según contrato y permisos. **Prioridad:** media. **Esfuerzo:** M. **Compartidos:** posibles rutas del gateway.

## Search

- **SRC-01 — Resultados dependen de proyección.** La búsqueda consume una proyección por RabbitMQ y sus resultados pueden estar vacíos o atrasados tras una publicación. La documentación local señala la dependencia del productor; no se comprobó aquí con una propiedad nueva. Evidencia: `apps/search-service/src/modules/projections/projections.module.ts:12`, `docs/dev-local-completo.md` limitaciones. Mejora: verificar extremo a extremo publicación→evento→índice y ofrecer estado de actualización observable. **Prioridad:** alta. **Esfuerzo:** M/L según productor. **Compartidos:** posible `docker-compose.yml` y contrato de eventos.
- **SRC-02 — Disponibilidad proyectada requiere comunicación continua.** Search informa `PROJECTED` y la pantalla lo muestra; no se verificó visualmente ni contra una reserva real. Evidencia: `pages/Search.tsx:88`. Mejora: mantener la advertencia en resultados y en detalle, y confirmar solo mediante Bookings. **Prioridad:** media. **Esfuerzo:** S/M. **Compartidos:** no.

## Bookings

- **BKG-01 — Historial del huésped inexistente.** La web solicita `GET /bookings`; el gateway solo declara POST en la colección y GET por ID/historial OWNER. GET anónimo devolvió 404. Esto bloquea la navegación desde «Mis reservas» hacia cancelación y reseña para el huésped, aunque las rutas individuales existan. Evidencia: `api/bookings-history.ts:14`, `modules/bookings/bookings.controller.ts:25`, `pages/MyBookings.tsx:54`. Mejora: listado paginado limitado al usuario autenticado, con filtros y contrato, más pruebas de aislamiento. **Prioridad:** alta. **Esfuerzo:** M. **Compartidos:** gateway/contrato; coordinar `app.module.ts` si cambia el módulo.
- **BKG-02 — Filtro de propiedades del anfitrión solo cubre página actual.** Se construye desde los nombres de la página recibida y se filtra en cliente, pudiendo ocultar reservas de otras páginas o mezclar propiedades con igual nombre. Evidencia: `pages/host/BookingsReceived.tsx:10`. Mejora: filtrar por ID en el servidor o indicar explícitamente el alcance y la paginación. **Prioridad:** media. **Esfuerzo:** M. **Compartidos:** contrato de Bookings/gateway si se agrega filtro.

## Payments

- **PAY-01 — Confirmación no respaldada por el estado del servidor.** `simulateCharge` aprueba por el token local; `Payment` cambia a fase `paid` y `chargeMessage` afirma que la reserva está confirmada sin releer Bookings. Esto puede contradecir el estado real. Evidencia: `api/payments.ts:44`, `pages/booking/Payment.tsx:66`, `api/payments.ts:51`. Mejora: mantener el pago simulado y Payments interno, pero presentar el resultado como simulación y consultar/reintentar el estado de Bookings antes de afirmar confirmación. **Prioridad:** alta. **Esfuerzo:** S/M. **Compartidos:** no; preservar invariante de no exponer `/payments`.

## Reviews

- **REV-01 — Reseña depende de acceso a una reserva completada.** Existen pantalla y `POST /reviews`, pero el acceso habitual desde mis reservas queda afectado por BKG-01. No se probó elegibilidad real ni creación. Evidencia: `pages/MyBookings.tsx:98`, `pages/booking/ReviewProperty.tsx:30`, `api/reviews.ts:57`. Mejora: resolver BKG-01 y validar con reserva completada y autorización real. **Prioridad:** alta. **Esfuerzo:** S después de BKG-01. **Compartidos:** no previstos.

## Notifications

- **NOT-01 — Sin bandeja ni estado de entrega en la web.** No hay ruta ni cliente web de notificaciones; el servicio es interno por diseño. Evidencia: `app/routes.tsx:127`, `apps/api-gateway/src/app.module.ts`. Mejora: definir primero un caso de uso y una lectura autorizada, manteniendo envío interno; no exponer datos directamente por conveniencia. **Prioridad:** baja. **Esfuerzo:** L. **Compartidos:** gateway y configuración si se acuerda un contrato nuevo.

## Reports

- **RPT-01 — Filtro de fechas admite igualdad en el HTML.** El campo final es exclusivo y usa `min={filters.from}`, que permite seleccionar la misma fecha; no se identificó validación de rango en el formulario previo al envío. Evidencia: `pages/host/Reports.tsx:73`, `apps/reports-service/README.md` API. Mejora: validar `to > from` y longitud máxima con mensaje accesible antes de consultar. **Prioridad:** media. **Esfuerzo:** S. **Compartidos:** no.
- **RPT-02 — Ocupación no incorpora bloqueos de inventario.** La propia documentación de Reports indica que no incorpora bloqueos; el servicio Inventory actual representa productos y servicios de habitación, no un calendario de bloqueos. No se comprobó un cálculo real. Evidencia: `apps/reports-service/README.md` sección de ocupación; `apps/room-inventory-service/README.md` límites. Mejora: acordar la fuente de disponibilidad y definir semántica antes de extender la métrica; mientras tanto mostrar límites de cobertura. **Prioridad:** media. **Esfuerzo:** L. **Compartidos:** contratos entre servicios y posiblemente `docker-compose.yml`.

## Inventory

- **INV-01 — API sin interfaz de gestión.** El gateway declara lectura, alta de ítem y reemplazo versionado por habitación, pero no existe pantalla/ruta o cliente web que los use. Evidencia: `modules/inventory/inventory.controller.ts:20`, `app/routes.tsx:127`, `pages/host/HostHome.tsx:16`. Mejora: añadir desde edición de habitación una gestión mínima de productos/servicios, manejo de versiones y errores 403/409/503. **Prioridad:** media. **Esfuerzo:** M. **Compartidos:** rutas web; gateway ya tiene módulo.
- **INV-02 — Integración operativa por validar.** Contenedores y DB están saludables, pero no se ha consultado una habitación con una sesión OWNER ni ejercitado el contexto de Accommodations. Evidencia: `apps/room-inventory-service/README.md`; `modules/inventory/inventory.controller.ts:24`. Mejora: prueba autenticada por propietario y prueba de acceso ajeno, tras contar con datos ficticios autorizados. **Prioridad:** alta. **Esfuerzo:** M. **Compartidos:** posible configuración de JWT y `docker-compose.yml` si se detectan errores.

## Chat

- **CHAT-01 — Consulta privada necesita UUID y coincidencia textual.** La ventana reconoce un UUID o ciertas expresiones con «mi» y reserva/pago; no lista reservas ni maneja todas las preguntas de seguimiento. Evidencia: `components/ChatWidget.tsx:8`, `:80`. Mejora: después de BKG-01, ofrecer selección autenticada y mantener el dato privado fuera del modelo; verificar cambio de cuenta y permisos. **Prioridad:** media. **Esfuerzo:** M. **Compartidos:** contrato de Bookings/gateway si se amplía.
- **CHAT-02 — Tasas fijas.** La conversión usa tasas de referencia COP/USD/EUR/GBP estáticas, no precios de mercado. Evidencia: `components/chatCurrency.ts:3`. Mejora: mostrar fecha/fuente o evitar usarlas para decisiones sensibles; si se integran tasas reales, definir caducidad y errores. **Prioridad:** media. **Esfuerzo:** S/M. **Compartidos:** posible configuración externa si se añade proveedor.
- **CHAT-03 — Explicaciones y fuentes deben probarse con datos reales.** La explicación enumera filtros y una muestra, pero la extracción depende del modelo y puede omitir criterios; se consulta hasta 10 resultados y detalles de tres. No se realizó POST de chat ni prueba con Ollama en esta auditoría. Evidencia: `modules/chat/chat-catalog.service.ts:20`, `modules/chat/chat-explanation.ts:10`, `docs/chatbot-local.md` sección de explicación. Mejora: evaluar preguntas con filtros, fuentes caídas y reseñas inexistentes; mostrar filtros no reconocidos cuando sea posible. **Prioridad:** alta. **Esfuerzo:** M. **Compartidos:** no previstos.

## API Gateway

- **GW-01 — Listados ausentes en rutas públicas de la aplicación.** `GET /bookings` y `GET /properties?mine=true` no están declarados; existen sus operaciones POST y consultas por ID. Evidencia: `modules/bookings/bookings.controller.ts:25`, `modules/accommodations/accommodations.controller.ts:65`; GET anónimos 404. Mejora: implementar junto con BKG-01 y ACC-01, autenticando y propagando identidad sin confiar en ID del cliente. **Prioridad:** alta. **Esfuerzo:** M. **Compartidos:** contratos, `app.module.ts`/`gateway-config.ts` solo si se requiere.
- **GW-02 — URLs de identidad y resto del cliente pueden divergir.** Identidad usa `/api/v1` fijo, mientras Axios usa `VITE_API_BASE_URL`. Una configuración con base distinta puede dirigir autenticación y datos a destinos diferentes. Evidencia: `api/identity.ts:26`, `api/http.ts` función `resolveBaseUrl`. Mejora: unificar base y probar proxy, cookies y refresh en cada entorno. **Prioridad:** media. **Esfuerzo:** S/M. **Compartidos:** `vite.config.ts` y configuración de despliegue, si aplica.

## Web transversal

- **WEB-01 — Error 404 de navegación oculto.** Toda ruta desconocida redirige a inicio, sin explicar que la página no existe. Evidencia: `app/routes.tsx:173`. Mejora: página 404 accesible con enlace al inicio y a búsqueda. **Prioridad:** baja. **Esfuerzo:** S. **Compartidos:** no.
- **WEB-02 — Mocks opcionales y comentarios antiguos pueden confundir la validación.** El worker MSW es opcional en desarrollo; algunos comentarios aún dicen que el gateway no expone rutas que sí existen, como historial OWNER y creación de reserva. Evidencia: `main.tsx:7`, `api/bookings-history.ts:9`, `api/bookings.ts:8`, `modules/bookings/bookings.controller.ts:25`. Mejora: actualizar comentarios y mostrar claramente en documentación si se ejecuta con mocks; no tratar tests MSW como prueba de integración real. **Prioridad:** media. **Esfuerzo:** S. **Compartidos:** no.
- **WEB-03 — Flujos completos y accesibilidad visual pendientes.** Hay estados de carga/error y reintento en varias pantallas, pero no se inspeccionaron interacciones, móvil, teclado o lectores de pantalla en navegador. Evidencia: `pages/Search.tsx:67`, `pages/PropertyDetail.tsx:68`; limitación de herramientas de esta auditoría. Mejora: recorrido manual con usuarios ficticios y registro de resultados; no considerar ejecutados los flujos enumerados en el alcance. **Prioridad:** alta. **Esfuerzo:** M. **Compartidos:** no previstos.

## Orden y ramas sugeridas

Las ramas siguientes son propuestas, no se han creado. Trabajar desde la base aprobada y coordinar archivos compartidos; no fusionar esta rama local de integración como sustituto de revisión.

| Orden | Rama sugerida | Tareas | Dependencias / conflictos |
| --- | --- | --- | --- |
| 1 | `fix/bookings-guest-history` | BKG-01, GW-01 parcial, REV-01 | Contrato Bookings + gateway; desbloquea chat y reseñas. |
| 2 | `fix/accommodations-owner-and-photos` | ACC-01, ACC-02, GW-01 parcial | Coordinar gateway con paso 1; definir autorización y foto. |
| 3 | `fix/web-payment-status` | PAY-01 | Mantener simulación y Payments interno; independiente de nuevas rutas. |
| 4 | `fix/search-projection` | SRC-01, SRC-02 | Coordinar eventos Accommodations/Search y Compose si corresponde. |
| 5 | `feat/users-profile-web` | USR-01 | Verificar contrato de subida y coordinar gateway. |
| 6 | `feat/inventory-web` | INV-01, INV-02 | Depende de propiedades/habitaciones y permisos; comprobar integración. |
| 7 | `fix/reports-filters` | RPT-01; definir RPT-02 | Métrica avanzada solo tras acordar fuente de disponibilidad. |
| 8 | `fix/chat-explanations` | CHAT-01, CHAT-02, CHAT-03 | CHAT-01 se beneficia de BKG-01; no mezclar datos privados con el modelo. |
| 9 | `fix/web-session-and-routing` | AUTH-02, GW-02, WEB-01, WEB-02 | Coordinar `vite.config.ts` y rutas con cambios web anteriores. |
| 10 | `test/web-integrated-flows` | WEB-03 y pruebas autenticadas pendientes | Después de los cambios; datos ficticios y ambiente aislado. |
| 11 | `feat/auth-recovery` / `feat/notifications-inbox` | AUTH-01, NOT-01 | Fase posterior; definir contratos y seguridad antes de tocar módulos compartidos. |
