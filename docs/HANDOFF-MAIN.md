# HANDOFF-MAIN · StayHub · 20 de noviembre de 2026

**Estado para el equipo.** Reconstrucción y recorridos críticos aprobados en la rama local. La autorización para integrar y las pruebas del futuro árbol combinado siguen pendientes. Destino propuesto: main del remoto origin.

## Evidencia de la reconstrucción

Contextos de imagen cotejados con 6a57420, herramientas de preparación de d6240b5 y comprobaciones de Chrome de 268258a. Builder BuildKit nuevo y proyecto stayhub-clean-3976416. La primera construcción descargó sus dependencias y compartió capas únicamente dentro de ese ensayo. Se cargaron 22 imágenes propias: Auth, Users, Accommodations, Search, Bookings, Payments, Reviews, Notifications, Room Inventory y Reports, cada uno con su migrador, más Gateway y frontend NGINX. Las diez migraciones terminaron con código 0. Los otros 27 contenedores alcanzaron healthy. Los datos, claves y certificados del ensayo se generaron localmente. El proyecto y el builder quedaron detenidos, sus volúmenes conservados y los 26 contenedores activos de la integración original sanos.

Pasaron registro e inicio de sesión, autorización de verificador, publicación, búsqueda, reserva idempotente, pago y reembolso. Chrome verificó ruta profunda HTTPS, recarga, foto, respuesta JSON de error y renovación de sesión. El reporte LIVE devolvió COP en unidades menores: chargedMinor 30000100, refundedMinor 30000100 y netMinor 0. El precio incluía 240000 COP de alojamiento y 60001 COP de desayuno. La prueba del propietario contrastó API y pantalla: 2/4 noches (50 %), 2/2 (100 %), 0/1 en la fecha de salida y 0/2 después de cancelar. Un verificador obtuvo 403 al pedir un reporte restringido. Comandos y requisitos en [reconstruccion-limpia.md](reconstruccion-limpia.md).

## Qué aportó main y qué existe hoy en los dos árboles

Comparación directa de a2d34417500f6950252009ccdcd0d55723fd3616 (origin/main, verificado contra el remoto) con 268258a5ef8438b85a5992b67f9f52d6bbb0dcda. Diferencia global en ese corte: 424 archivos, 17118 inserciones y 654 supresiones de líneas. Ningún archivo de main está eliminado en la punta local. Hay dos mejores ancestros comunes, cf02644 y e56caa5. Un único diff de tres puntos puede ocultar el aporte del otro ancestro.

Los dos commits exclusivos del historial de main son 2b9da48 (conciliación de Reports y el Gateway/frontend existente) y a2d3441 (PR #21). Frente al primer padre cf02644 entraron el servicio de analítica, su migración inicial, contratos internos y OpenAPI, fuentes de oferta/reservas/movimientos, pantalla del propietario, Dockerfile, Compose de Reports y herramientas de demo y smoke. Frente a e56caa5 entraron, entre otros, los proxies de Accommodations y Search y su configuración. La conciliación 2b9da48 tocó respecto de ambos padres .gitignore, app.module.ts, gateway-config.ts, package.json y dev-gateway.mjs. La regla ESTADO-PROYECTO.md sigue presente localmente y dev-gateway.mjs es idéntico. Conservar rutas, configuración, scripts y dependencias de ambos conjuntos al revisar esos archivos.

El árbol apps/reports-service es exactamente 924decaf3b089d055f67e8aa34ff52f50314adbf en las dos puntas. Incluye 202611150001_reports_init y migration_lock.toml. El árbol infra/docker/reports es 400fd85242588f921e29cefd580ffa0098c7bc5b en ambos. specs/006-reportes también coincide. No se identificó una migración, contrato ni corrección interna de Reports exclusiva del árbol actual de main. Sí son exclusivos de ese árbol algunos comportamientos sustituidos localmente: Payments sólo reconoce el cobro por approvedAt y el módulo raíz del Gateway importa el símbolo ReportsProxyModule sin registrarlo en imports. Recuperarlos literalmente arriesga omitir cobros y dejar la ruta sin registrar.

## Cambios locales que afectan al resultado

| Componente | Diferencia respecto a origin/main y decisión propuesta |
|---|---|
| Payments | e25c2ed conserva approvedAt como primera fuente y recupera el instante de la primera transición APPROVED si falta. Conserva REFUND por la primera transición COMPLETED y el intervalo semiabierto. Mantener reports-facts.query.ts y su prueba unitaria. Actualizar en el futuro candidato la descripción de esta alternativa en internal-sources.md. |
| Bookings | La instantánea del desayuno conserva el precio pactado aunque cambie la oferta. Preservar la migración, el repositorio de reservas y el trabajo de pago; contrastar el total de la reserva con los movimientos de Payments. |
| Accommodations y Search | Mantener autenticación de la fuente de oferta por emisor, clave y alcance reports:read, junto con captura de oferta y publicación verificada. La proyección de búsqueda amplía el contrato v1 con rooms opcional y valida capacidad, precio y moneda. |
| Gateway y frontend | Mantener el registro efectivo de ReportsProxyModule junto con Search y Accommodations. El cliente admite el rol VERIFIER, sujeto a autorización. La pantalla rechaza períodos vacíos, invertidos o mayores de 366 días. Mantener filtros, agrupación y aislamiento por propietario. |
| Compose | La rama incorpora Reports a docker-compose.yml. El overlay histórico de integración sigue disponible y usa !override en security_opt para evitar duplicados. docker-compose.reports.yml de demo se conserva. Mantener redes privadas, secretos y dependencias de migración/salud. reports-live-env.mjs resuelve archivos desde el proyecto. |
| Migraciones y eventos | La rama añade diez migraciones fuera de Reports: cuatro de Accommodations y una por cada uno de Auth, Users, Bookings, Notifications, Inventory y Search. Los JSON Schema booking-payment-events-v1 y payment-events-v1 son idénticos en las puntas. Reports LIVE consulta fuentes HTTP paginadas; su exactitud también depende de las transiciones que materializan los consumidores. |

## Conflictos posibles y verificación del candidato

La inspección de ambas puntas y ancestros identifica solapamientos en Gateway, fuentes de oferta y pagos, módulos de Bookings, esquema de Accommodations, pantalla/rutas del frontend, package.json y overlay de Reports. Que coincida una ruta modificada no demuestra un conflicto textual. El árbol combinado y los conflictos efectivos aún están por verificar. Revisar cada resolución por función. Preservar los blobs coincidentes y evitar reescribir migraciones aplicadas. El problema del módulo de Gateway y el fallback de cobros son ejemplos de regresiones posibles incluso con una integración textual limpia.

1. Tras autorización, fijar de nuevo los dos SHA y crear un candidato aislado. Revisar el registro de módulos, contratos, scripts npm y lockfile por secciones. Comparar el resultado con ambas puntas. Verificar configuración de Compose base, local y overlay histórico y que LIVE apunta a las tres fuentes autenticadas.
2. Construir el candidato con builder, proyecto, secretos y volúmenes nuevos siguiendo el procedimiento de reconstrucción. Verificar 22 imágenes propias, diez migraciones exitosas y salud. Ensayar además la actualización desde una base sintética con las migraciones de main aplicadas. Verificar checksums y conservar oferta histórica y reservas anteriores al desayuno.
3. Ejecutar ambos recorridos documentados. Comprobar en API y navegador los cuatro cocientes de ocupación, exclusión de checkout, cancelación, agrupación y filtros de propiedad. Probar dos propietarios, acceso de tercero y permisos de verificador. Una fuente caída debe producir el error de contrato. Una respuesta DEMO invalida la aceptación LIVE.
4. Probar cobro con y sin approvedAt, reembolso en otro período sobre reserva antigua, límites UTC [from,to), moneda separada, reserva rechazada, eventos duplicados y primera transición COMPLETED. Conciliar unidades menores con Payments y validar que el mismo movimiento cuenta una vez. Probar consumidores con mensajes históricos y nuevos, incluidas proyecciones con y sin rooms.
5. Ejecutar CI, contratos y pruebas de los servicios modificados sobre el SHA candidato. La reconstrucción local no vuelve a certificar de forma independiente geolocalización/mapa, inventario concurrente ni todos los requisitos históricos. Adjuntar sus resultados aplicables al PR, diferencias revisadas y SHA evaluado. Solicitar autorización explícita antes de publicación o integración. Si falla, conservar diagnósticos y volúmenes aislados, corregir el candidato y repetir. La integración original sigue disponible.

## Comandos de contraste (sólo lectura)

~~~powershell
git ls-remote origin refs/heads/main
git merge-base --all a2d3441 268258a
git log --oneline --parents 268258a..a2d3441
git diff-tree --cc --name-only -r 2b9da48
git diff --name-status cf02644 a2d3441
git diff --name-status e56caa5 a2d3441
git diff --stat a2d3441 268258a
git diff --name-status --diff-filter=D a2d3441 268258a
git diff a2d3441 268258a -- apps/reports-service infra/docker/reports specs/006-reportes
git diff a2d3441 268258a -- apps/payments-service apps/bookings-service apps/accommodations-service apps/api-gateway apps/web docker-compose.yml docker-compose.reports.integration.yml specs
~~~

Quedan aplazados nuevos ensayos de renovación TLS, tareas operativas de Ollama y aprovisionamiento Azure. El ensayo histórico de rotación figura en el relevo. Las pruebas de esta reconstrucción corresponden exclusivamente a local/stayhub-integracion.
