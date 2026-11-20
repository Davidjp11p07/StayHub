# STAYHUB — PROMPT MAESTRO OPTIMIZADO PARA CODEX

**Versión:** 2026-11-19 · **Objetivo:** integración local reproducible, 10 microservicios + chatbot, siete requisitos adicionales, preparación para PR y publicación en Azure. **Entrega objetivo:** miércoles 25-11-2026.

> **Este documento es el contrato de trabajo estable, NO un resumen del estado actual.** Se reutilizará en sesiones consecutivas de Codex de distintas cuentas/modelos (modelo y nivel de razonamiento variables según la tarea). La autoridad sobre lo ya implementado es **Git + código + pruebas + `docs/relevo-agentes.md`**. No confíes en suposiciones sobre el avance ni en el texto de una sesión anterior.
>
> **Prioridad de eficiencia:** entregar incrementos verificados, evitar análisis repetitivos y conservar el contexto entre cambios de sesión. No confundas rapidez con saltarse pruebas, seguridad o integridad de datos.

## 0. REGLAS INNEGOCIABLES

- **Único worktree permitido para editar:** `C:\Users\david\Projects\StayHub\stayhub-integracion-local`.
- **Única rama editable:** `local/stayhub-integracion`.
- **PROHIBIDO modificar o ejecutar operaciones que alteren** `C:\Users\david\Projects\StayHub`, `main`, ramas o worktrees de compañeros, PR #21 Reports, PR #24 Chatbot o `inventory_service`.
- **Sin autorización explícita:** NO `push`, abrir/cerrar PR, merge, rebase, cherry-pick, reset, stash, clean, force-push, cambios de rama, borrado de volúmenes o datos, publicación por Internet ni aprovisionamiento de recursos de Azure de pago.
- Sí puedes generar **commits locales pequeños**, después de revisar diffs y secretos. No uses `git add -A` sin inspección ni confirmes archivos temporales/sensibles.
- **Un solo agente controla el worktree y el Docker compartido a la vez.** Al cambiar de cuenta/sesión, confirma que el anterior ya no está escribiendo, migrando o reconstruyendo.
- No agregues secretos, tokens, claves privadas ni datos reales a Git, logs de relevo o respuestas.
- No simules disponibilidad, pagos, aprobaciones, reportes ni resultados E2E para hacer pasar una prueba. Un `healthy`, build exitoso o test mock **no equivale** a flujo de negocio comprobado.
- Ninguna optimización puede debilitar controles JWT, autorización, bloqueo transaccional, idempotencia o persistencia.

### Estado de partida (REFERENCIAS, no verdades permanentes)

- Worktree: `C:\Users\david\Projects\StayHub\stayhub-integracion-local`.
- Commit histórico: `7c2bbc6edae6bc19ddcaec4da4ae12a8cbed19e5`. **No asumir que sigue siendo HEAD.**
- Frontend local: `http://localhost:5173`; gateway local: `https://127.0.0.1:18080` (TLS autofirmado).
- Compose local: `docker-compose.yml` + `docker-compose.reports.integration.yml` + `.artifacts/compose-local-ports.yml` (este último es local/ignorado; **no lo sobrescribas**).
- Ollama local: `host.docker.internal:11434`, puede estar apagado; no bloquea tareas ajenas al chatbot.
- Los **10 microservicios** son Auth, Users, Accommodations, Search, Bookings, Payments, Notifications, Reviews, Room Inventory y Reports; el **chatbot es una funcionalidad del Gateway y frontend**, no un undécimo microservicio.
- La rama incluye commits de `inventory_service`, Reports y Chatbot. Eso no implica que estén ya en `main`.
- Hay 37 inmuebles sintéticos ya creados en la base local; sus identificadores/estado de seed pueden depender de `.artifacts/demo-properties-state.json` ignorado por Git. No repetir seeds a ciegas.
- Históricamente: Search por fecha fallaba (SEARCH-04), tokens servicio-servicio tenían renovador temporal, Auth→Users devolvía 503 intermitente, PAY-04 necesitaba pruebas con Payments real, regresión web 333/345. **Estos datos pueden estar obsoletos:** consultar el relevo y pruebas recientes.

---

## 1. ARRANQUE RÁPIDO DE CADA SESIÓN — AHORRAR CONTEXTO

**Objetivo del arranque: ≤ una revisión focalizada; no iniciar una auditoría general.**

1. Confirma `pwd`, rama y diferencias con `git status --short`, `git log -5 --oneline`, `git diff --stat`, `git diff --cached --stat`. Si la ruta o rama son incorrectas, **detente sin modificar**.
2. Lee **completo** `docs/relevo-agentes.md` si existe. Lee el **índice, resumen y últimas entradas relevantes** de `docs/progreso.md`; **no vuelvas a cargar sus decenas de páginas** salvo necesidad concreta. Lee de este prompt las reglas y el bloque que corresponda a la tarea actual. En una sesión nueva que nunca ha visto este contrato, consúltalo entero **una sola vez**.
3. Contrasta el relevo con el estado Git, archivos sin commit, procesos en curso y artefactos/resultados que correspondan a la tarea. Una anotación desactualizada no autoriza a sobrescribir trabajo.
4. Elige **una sola unidad de trabajo**: primero termina lo que quedó a medias si sigue siendo prioritario; si está bloqueado, continúa la siguiente tarea independiente de mayor impacto.
5. Formula un microplan de **máximo 5 líneas**: problema → archivos/servicios → prueba mínima → criterio de cierre → siguiente acción. Ejecútalo sin volver a describir el proyecto completo.
6. Nunca reinstales dependencias, vuelvas a generar Prisma, reconstruyas todos los contenedores ni corras todas las pruebas al inicio **por costumbre**. Hazlo solo cuando haya una razón técnica y limita el alcance.

**Si la sesión anterior murió por límite de créditos:** reconstruye el estado usando Git/diffs, último relevo, logs y tests; inspecciona procesos vivos. Actualiza el relevo **antes de operaciones de riesgo**, sin pedir al usuario que copie todo el historial.

### Regla de uso eficiente de herramientas y tokens

- Inspecciona primero el contrato, archivo, función y prueba ligados al error. Prefiere búsquedas dirigidas (`rg`, tests focalizados) frente a leer directorios enteros.
- Reutiliza comandos/scripts E2E y fixtures; no crees otro framework o herramienta salvo ausencia justificada.
- **Pirámide de validación:** (a) pruebas focalizadas + typecheck → (b) pruebas de contrato/integración en DB aislada → (c) reconstrucción solo de contenedores afectados → (d) API/Chrome real → (e) regresión completa al cerrar un bloque o antes de release. No ejecutes siempre el paso (e) tras cada archivo.
- Mantén Docker cache; evita `npm ci` reiterado sin cambio de lockfile, dependencias o necesidad real. Si un comando se atasca, inspecciona el proceso y logs con una duración razonable, registra evidencia y cambia a una tarea independiente; **no reinicies indefinidamente el mismo comando**.
- No recrees toda la pila para cambios de una sola aplicación; valida versión/código realmente cargado por el contenedor.
- Al terminar cada unidad útil, guarda commit local focalizado y checkpoint. **La eficiencia se mide en requisitos verificados por sesión, no líneas de código o comandos ejecutados.**

---

## 2. PROTOCOLO DE RELEVO ENTRE CUENTAS (IMPRESCINDIBLE)

Mantén dos archivos con responsabilidades distintas:

- **`docs/relevo-agentes.md`**: estado **actual** y próximo comando, compacto (**idealmente ≤120 líneas**). Se actualiza al cerrar una unidad, antes de un comando largo/riesgoso y al cambiar de tarea; no reescribir por cada comando trivial.
- **`docs/progreso.md`**: historial de hallazgos, decisiones y resultados. Añade una entrada por **hito o corrección**, no copies logs enteros ni dupliques el resumen varias veces.

Si no existen, créalos sin borrar información previa. Si existe una versión diferente de este prompt en `docs/instrucciones-integracion-codex.md`, compara y conserva los acuerdos más recientes; no reemplaces ciegamente. Instala este prompt allí **solo tras comprobar que no eliminas instrucciones vigentes**.

### Estructura fija de `docs/relevo-agentes.md`

```markdown
# RELEVO — STAYHUB (estado operativo vigente)
- Actualizado: YYYY-MM-DD HH:mm (zona local)
- Worktree / rama / HEAD: ...
- Git: archivos sin commit y razón; commits recientes
- Control de escritura: agente anterior detenido / proceso identificado / desconocido

## TAREA ACTIVA
- ID y prioridad:
- Estado: pendiente | diagnosticando | implementando | validando | bloqueado | verificado
- Evidencia ya reunida (archivo/ruta/comando/resumen):
- Archivos tocados y contrato/decisión relevante:
- ÚLTIMA OPERACIÓN y resultado real:
- SIGUIENTE ACCIÓN EXACTA (comando o función):

## ENTORNO Y PRUEBAS
- Compose efectivo y servicios reconstruidos (sin secretos):
- Migraciones: aplicadas / pendientes / desconocidas
- Pruebas focalizadas, API, Chrome y regresión: comando + PASS/FAIL/NO CORRIDO
- Procesos en ejecución, puertos, Ollama, renovador temporal (sin credenciales):

## SIGUIENTES 3 PRIORIDADES
1. ...
2. ...
3. ...

## RIESGOS Y TRASLADO A MAIN
- Bloqueos / cuidado con datos, migraciones, dependencias:
- Commits locales y PR/servicio destino (sin ejecutar traslado):
```

**Nunca marques como PASSED una prueba no ejecutada.** Distingue explícitamente: código editado, test aislado, contenedor reconstruido, API probada y Chrome E2E probado. Si algo no se pudo revisar, escribe **NO VERIFICADO**.

### Antes de agotar créditos o ceder la sesión

1. Guarda el último estado real en `docs/relevo-agentes.md` y, si corresponde, una entrada histórica en `docs/progreso.md`.
2. Revisa `git status` y diffs; commit local seguro de unidad terminada o identifica los archivos **sin commit que deben preservarse**.
3. Deja el **siguiente comando exacto** y una segunda tarea independiente si se bloquea.
4. Reporta brevemente: logrado, comprobado, pendiente y riesgo. No vuelvas a enumerar los 10 servicios ni repitas todo el prompt.

---

## 3. COLA ÚNICA DE TRABAJO (ORDEN OBLIGATORIO)

**No hay dos fases finales ni dos órdenes contradictorios.** Ejecuta esta secuencia y reordena solo si existe una dependencia técnica demostrada; documenta el motivo.

| Orden | ID | Prioridad | Condición de cierre |
|---|---|---|---|
| 0 | RECOVER | P0 | Estado real, unidad activa y relevo reconciliados |
| 1 | SEARCH-04 + REQ-04 + REQ-07 | P0 | Búsqueda por fechas y reservas concurrentes consistentes |
| 2 | AUTH-S2S + REG-503 | P0 | Tokens seguros sin terminal renovadora; registro idempotente |
| 3 | PAY-04 + REQ-03 | P0 | Pagos mock, aprobaciones tardías y reembolsos reales verificados |
| 4 | REQ-05 | P1 | Rol de verificador y publicación autorizada, con permisos probados |
| 5 | REQ-06 | P1 | Desayuno opcional y total consistente en reserva, pago y reporte |
| 6 | REQ-01 + REQ-02 | P1 | Ciudad/país consistentes y coordenadas elegidas en mapa |
| 7 | GUEST/OWNER + CHAT | P1 | Flujos restantes de huésped, anfitrión y chatbot verificados |
| 8 | WEB/SEED/REGRESSION | P1 | Regresión crítica en verde; datos demo reproducibles |
| 9 | COMPOSE/RELEASE-READY | P0 previo a cierre | 10 servicios reproducibles y preparación documental de Azure |
| 10 | HANDOFF-MAIN | P0 previo a PR | Informe verificable y plan de PR, **sin hacerlo** |

**Prioridad P0/P1 no autoriza omitir los siete requisitos obligatorios.** La entrega del miércoles requiere también acceso por Internet. Si el tiempo no alcanza, identifica alcance faltante con evidencia; no informes “listo” falsamente.

### REGLAS PARA NO DUPLICAR TRABAJO

- SEARCH-04 y filtros (REQ-04) son un mismo frente; **no implementar dos mecanismos de fechas**.
- Concurrencia de reservas (REQ-07) se prueba dentro de Bookings/SEARCH-04; **no reescribir un bloqueo que ya funciona**.
- Pasarela simulada (REQ-03) **ya existe** en Payments (`MockPaymentGatewayAdapter`); audítala, no crees otra.
- Mapa de visualización (`LocationMap.tsx`) y latitud/longitud **ya existen**. Lo nuevo es **seleccionar coordenadas al publicar/editar**.
- `BREAKFAST_INCLUDED` ya es una **amenidad booleana**; **no equivale** al desayuno opcional de pago.
- El actual Room Inventory maneja **productos/servicios por habitación**: no supongas que representa ocupación o calendario de reservas. Comprueba en código y define fuente de verdad sin forzar una responsabilidad errónea.
- Reports corre mediante Compose adicional; **Inventory ya está en Compose principal de esta rama**. Consolidar solo al final, no durante SEARCH-04.

---

## 4. ESPECIFICACIONES Y PRUEBAS DE ACEPTACIÓN POR BLOQUE

### P0-A. SEARCH-04, filtros (REQ-04) y concurrencia (REQ-07)

**Problema histórico:** con fechas, Search devolvía cero por falta de ventanas proyectadas; sin fechas sí encuentra alojamientos. Existe outbox Accommodations → RabbitMQ → Search. No descartarlo ni inventar intervalos libres.

1. Inspecciona Accommodations (propiedad/habitación/capacidad), Bookings (reservas, retenciones y vencimiento), Search (proyección y filtros) y Room Inventory (catálogo de servicios/productos); documenta **fuente de verdad de cada dato**.
2. Diseña integración mínima coherente: eventos/proyección idempotente, reconstrucción posible, disponibilidad actualizada al reservar/cancelar/expirar/modificar inventario *si corresponde a disponibilidad real*. Retrasos y duplicados RabbitMQ no pueden confirmar una reserva inválida.
3. **Bookings debe realizar la verificación definitiva transaccional**; Search es una vista eventualmente consistente, no autoridad de inventario.
4. Unifica filtros end-to-end: ciudad (con/sin tilde), país, fechas, capacidad/huéspedes, rango de precios, comodidades, palabras clave, combinaciones, conteo y paginación fuera de rango.
5. Pruebas: Bogotá con/sin fechas; fechas ocupadas/libres; otras ciudades; capacidades; crear reserva, repetir búsqueda y cancelar; expiración de retención; dos usuarios simultáneos misma habitación/fechas → máximo una reserva incompatible; carga de múltiples intentos; caída/reentrega/reinicio de RabbitMQ; tarjeta, precio, fotos y detalle en Chrome.
6. Si la proyección está incompleta, exhibe un estado honesto; no declares libre lo desconocido.

### P0-B. JWT entre servicios y registro Auth→Users

- Examina emisores/verificadores: `kid`, `iat`, `exp`, issuer, audience y scopes; se observó discrepancia entre antigüedad máxima de 300 s y tokens locales de 30 días.
- `scripts/refresh-compose-service-tokens.mjs` es **temporal**. Diseña gestión automática segura que no dependa de una terminal abierta; no amplíes indiscriminadamente el TTL ni suprimas verificaciones.
- Prueba expiración/renovación/revocación, reinicio completo y flujos sin el script manual.
- Para 503 intermitente al registrar: correlaciona Gateway/Auth/Users; investiga timeouts, readiness, escritura parcial y reintentos. Evita cuentas duplicadas, maneja respuestas ambiguas y muestra resultado correcto en web.
- Prueba registros repetidos, simultáneos, duplicados, reinicios y recuperación con persistencia.

### P0-C. Payments, compensaciones y pasarela simulada (PAY-04 + REQ-03)

- Reutiliza `apps/payments-service/src/infrastructure/gateway/mock-payment-gateway.adapter.ts` y el flujo **Web → Gateway → Bookings → Payments**; no crees un segundo mock.
- Inspecciona `apps/bookings-service/src/infrastructure/persistence/prisma/payment-result.unit-of-work.ts` y decisiones de cancelación.
- Verifica cobro aprobado, rechazado, incierto y fallido; reintentos seguros, idempotencia, eventos repetidos/fuera de orden, y estados de BD/UI.
- Especialmente **aprobación después de cancelación**, con reembolso compensatorio conforme a política guardada, una sola vez, sin cancelar el estado de la reserva.
- Prueba reembolsos 0/50/100 %, redondeos Decimal, REFUND_PENDING, PARTIALLY_REFUNDED, REFUNDED, REVIEW_REQUIRED, reintentos y fallo de Payments.
- No aceptar únicamente tests unitarios o Payments simulado: ejecutar integración con **servicios reales** y datos sintéticos seguros.

### P1-A. Rol verificador de inmuebles (REQ-05)

- Inspecciona RBAC existente Auth/Users. Implementa rol de verificador solo mediante autorización legítima; **sin autoasignación desde registro ni elevación de privilegios**.
- En Accommodations: solicitud/revisión/resultado de verificación, estados claros, observaciones y trazabilidad. Propietario no aprueba su inmueble. Propiedades pendientes o rechazadas no deben aparecer en Search ni reservarse.
- UI mínima para verificador: listado, detalle/evidencia, aprobar/rechazar con razón. Adaptar Gateway y frontend propietario; accesos no autorizados deben fallar.
- Establece política de migración para propiedades existentes y las 37 demos, **sin borrar datos ni afirmar que una verificación real ya ocurrió**.
- Pruebas autorizaciones, transición de estados, publicación, eliminación de resultados en Search y comportamiento de reservas anteriores.

### P1-B. Desayuno opcional tarifado (REQ-06)

- Distingue `BREAKFAST_INCLUDED` del extra de pago. Propietario configura disponibilidad y precio del servicio, con moneda y unidad de cobro **explícitas** (por huésped/noche o política acordada); no inventes silenciosamente reglas contradictorias.
- El huésped elige aceptar/rechazar. **Backend** cotiza, calcula y persiste snapshot de alojamiento + desayuno + total; la web solo muestra el desglose.
- Bookings confirma precio y evita cambios entre cotización y reserva; Payments cobra exactamente ese total. Cancelaciones, reembolsos, reports y actualizaciones del inmueble conservan los importes históricos.
- Pruebas 0/1/N huéspedes, 1/N noches, cambios de precio, monedas, redondeos, dobles solicitudes, idempotencia, reembolso y reportes.

### P1-C. Países/ciudades y coordenadas (REQ-01 + REQ-02)

- Revisar modelo actual: país de 2 caracteres, ciudad/región texto; normalizar con ISO 3166-1 alpha-2, ciudades por país/región y equivalencias/tildes sin duplicados. **Preferir migración mínima y compatible**, no introducir un catálogo mundial innecesario.
- Validar formulario, publicación, búsqueda, sugerencias, filtros y chatbot sobre registros previos y nuevos. Mantener URLs/datos antiguos y rollback de migraciones aditivas.
- El detalle ya visualiza OpenStreetMap. Incorporar **selector interactivo** de latitud/longitud en crear/editar (marcador, clic, valores editables, validaciones, persistencia) reutilizando lo existente. No asignar ubicaciones reales ficticias a direcciones sintéticas.
- Comprobar accesibilidad básica del selector, vista de mapa y comportamiento sin coordenadas.

### P1-D. Flujos de huésped, propietario y Chatbot

**Huésped:** registro/login/logout, expiración, perfil/foto, filtros, detalle, reserva/pago, historial, cancelación, check-in/check-out, reseñas, notificaciones, fallos/vacíos.

**Propietario:** activación rol, crear/editar/publicar sujeto a verificación, fotos, precio/políticas, habitaciones e inventario, disponibilidad, reservas recibidas, reportes de ocupación/ingresos y sus filtros. Verificar persistencia y datos reales, no solo rutas HTTP 200.

**Chatbot (Gateway/web):** revisar `chat-intent.ts`, `chat-catalog.service.ts`, `chat.controller.ts`, `chat-explanation.ts`, `ChatWidget.tsx`. Conteo por ciudad/global, precios, fechas/disponibilidad, amenidades, seguimiento, typos, ciudades vacías, preguntas fuera de dominio. Datos y cifras deben venir de los servicios; no inventar. Mantener «¿Cómo llegué a esta respuesta?» con fuentes/filtros verificables; **nunca exponer razonamiento privado ni secretos**. Si Ollama está apagado, continuar tareas independientes y registrar limitación.

### P1-E. Regresión, web y datos demo

- Último baseline **histórico**, no actual: web 333/345, ocho timeouts multipart. Reproducir y corregir causa; no borrar pruebas, subir timeouts arbitrariamente ni declarar “todo verde” sin volver a ejecutar.
- Validar web responsive móvil/escritorio, teclado, contraste, formularios, carga/error/vacío, botones, fotos y WCAG AA aplicable. Mantener funcionalidad y evitar refactorizaciones cosméticas sin impacto en entrega.
- Preservar 37 propiedades sintéticas y fotos; validar seed idempotente. Preparar datos ficticios mínimos y **consistentes** de usuarios, reservas, pagos, inventario, reseñas, notificaciones, informes; no truncar ni borrar DB compartida. No copiar un archivo `.artifacts` a Git por facilidad.
- Al concluir las funcionalidades ejecuta las suites relevantes y los flujos E2E críticos en entorno real; reporta conteos **verificados en la sesión**.

---

## 5. DOCKER, DATOS Y DESPLIEGUE REPRODUCIBLE (ETAPA FINAL)

**No interrumpir tareas P0 para ordenar YAML si el stack actual funciona.** Ejecutar al concluir los frentes funcionales prioritarios.

1. Determina configuración Compose **efectiva** con `docker compose -f docker-compose.yml -f docker-compose.reports.integration.yml -f .artifacts/compose-local-ports.yml config` (si todos los archivos locales existen). Documenta variantes y faltantes; no los regeneres sobrescribiendo datos.
2. `docker-compose.yml` de la integración **ya** define `inventory-db`, `room-inventory-migrate`, `room-inventory-service`. **No duplicar.** Reports usa override para `reports-db`, `reports-migrate`, `reports-service` y extiende Gateway, Bookings, Payments, Accommodations.
3. Consolida Reports al Compose principal **solo si preserva exactamente los contratos efectivos**: merge correcto de environment/secrets/depends_on, healthcheck, puertos, networks, volumes, migraciones y políticas de seguridad. Conserva override anterior hasta validar y documenta la opción de revertir.
4. Verifica `docker compose config --quiet`, servicios, migraciones, tráfico entre redes y secretos/generación documentados. No dejar dependencias de archivos ignorados sin proceso de generación reproducible.
5. Prueba con una instalación **aislada de prueba** sin tocar datos reales ni usar `down -v`. Compara flujo de 10 microservicios + chatbot antes/después; reconstruir solo servicios afectados, respetar `COMPOSE_PARALLEL_LIMIT=1` y `COMPOSE_BAKE=false` y `--no-deps` cuando proceda.
6. **Producción en Azure (preparación, NO aprovisionar sin permiso):** preparar `docs/despliegue-azure.md` con arquitectura VM Ubuntu + Docker Compose + proxy HTTPS, tamaño por consumo medido, puertos públicos solo 80/443, DNS, CORS/API base URL, persistencia de PostgreSQL/imagenes/Redis/RabbitMQ según uso, backups, secretos, logs, reinicio, monitoreo y pruebas desde navegador externo. No exponer DB, Redis, RabbitMQ ni endpoint de Ollama.
7. Diseña entorno prod separado del local (por ejemplo archivo override de producción si conviene) sin hardcodear dominios ni credenciales. Considera gateway TLS actual y terminación en proxy, frontend Vite compilado, y que `host.docker.internal:11434` de Windows no garantiza Ollama en Azure. Documenta alternativa y limitación si Ollama no está disponible. No crear recursos con costo, adquirir dominios ni publicar servicios sin autorización.

---

## 6. PREPARACIÓN DEL PR GLOBAL HACIA `main` — SOLO INFORME

- La rama actual parte de `main` e incluye commits de Inventory, Reports, Chatbot y correcciones. **No asumir que `main` no avanzó**: antes de preparar PR comparar con `origin/main` actualizado, sin tocar worktrees ajenos ni integrar cambios sin permiso.
- Documentar alcance por servicio, commits, migraciones, configuraciones, pruebas realizadas/pendientes y pasos de rollback. El PR único puede reemplazar PR #21 Reports y #24 Chatbot **solo si el equipo lo aprueba**; no cerrar ni fusionar esos PR aquí.
- Preparar checklist de premerge: reproducibilidad, CI, seguridad, contratos, E2E, datos demo, secrets, migraciones y evaluación del diff. **No push, PR ni merge** sin autorización explícita del usuario.
- Distinguir claramente **LISTO LOCALMENTE**, **LISTO PARA PR** y **PUBLICADO EN INTERNET**. Ninguno implica automáticamente el siguiente.

---

## 7. CÓMO CERRAR CADA TAREA SIN DESPERDICIAR CRÉDITOS

Cada unidad debe terminar con este formato **breve y verificable** (en relevo + mensaje final):

```text
ID / estado: CORREGIDO-Y-VERIFICADO | CORREGIDO-NO-VERIFICADO | DIAGNOSTICADO | BLOQUEADO
Causa raíz y cambio: ... (1–3 líneas)
Archivos y commit local: ...
Evidencia: test/comando y resultado; API/Chrome; contenedores reconstruidos
Riesgos o pendientes: ...
SIGUIENTE PASO EXACTO: ...
```

**Criterio para «CORREGIDO-Y-VERIFICADO»:** prueba focalizada satisfactoria, prueba de integración del contrato afectado, contenedor actualizado cuando aplica y flujo real E2E cuando corresponde; no han aparecido regresiones pertinentes. De otro modo usar estado intermedio.

**Si falla una prueba:** buscar causa y corregirla. Si no es resoluble de forma segura ahora, checkpoint + tarea independiente; no atascar ciclos enteros con el mismo diagnóstico. No suprimir fallos.

**Al final del proyecto:** presentar tabla de 10 microservicios y chatbot, los siete requisitos REQ-01…07, resultados exactos de pruebas, pasos de arranque, limitaciones conocidas, preparación de PR y preparación de Azure. Mantener `docs/relevo-agentes.md` útil para un agente nuevo sin contexto.

## INSTRUCCIÓN EJECUTIVA

**Retoma ya la tarea activa que indique el estado REAL del worktree; no reinicies toda la auditoría.** Implementa → prueba focalizada → integra/verifica → checkpoint → commit local seguro → siguiente bloque. Elimina repetición de diagnósticos y reconstrucciones innecesarias, pero no reduzcas las verificaciones esenciales. Continúa autónomamente sin modificar `main`, sin push/PR y sin desplegar Azure sin permiso.
