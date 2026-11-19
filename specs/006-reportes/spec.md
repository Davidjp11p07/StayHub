# Feature Specification: Reportes por propietario

**Feature Branch**: `feat/reports-service`

**Created**: 2026-11-15

**Status**: Alcance confirmado el 2026-11-15

**Input**: Implementar Reports siguiendo el trabajo de Auth, Notifications y Payments, con imágenes Docker, pruebas y visualización de reservas, ingresos, ocupación, tendencias y métricas por propietario; consultar las decisiones de alcance.

## Fuentes y límites

- `tendencias.md`, RQ-12: reservas, ingresos, tasa de ocupación, cancelaciones y tendencias para propietario/administrador.
- `tendencias.md`, catálogo de servicios y puertos, e imagen aportada: `reports-service`, puerto `3011`, `GET /reports/owner/:id`, `GET /reports/occupancy`, `GET /reports/revenue`.
- `tendencias.md`, Sprint 4: estadísticas y gráficos en React, estadísticas de ocupación e ingresos y arranque con Docker Compose.
- `.specify/memory/constitution.md`: separación por capas, base propia, contratos explícitos, JWT, documentación y pruebas.

La rama conserva la base común de main; Reports no incorpora commits exclusivos de ramas hermanas. No se incluyen inventario, recomendaciones, edición de reservas, operaciones de cobro ni exportaciones PDF/Excel en esta propuesta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resumen de mi actividad (Priority: P1)

Como propietario quiero consultar mis reservas, sus estados y cancelaciones en un período y por alojamiento para entender mi actividad. Como administrador quiero consultar el mismo resumen para un propietario autorizado.

**Why this priority**: Es la entrada principal al reporte y establece el aislamiento entre propietarios.

**Independent Test**: Con dos propietarios y reservas de estados conocidos, cada propietario obtiene exclusivamente sus métricas; el administrador puede consultar un propietario concreto y un huésped no accede.

**Acceptance Scenarios**:

1. **Given** un propietario autenticado, **When** consulta su resumen, **Then** recibe totales y desglose por estado del período solicitado.
2. **Given** un propietario autenticado, **When** intenta consultar otro propietario, **Then** se deniega el acceso antes de consultar sus datos.
3. **Given** un administrador autenticado, **When** consulta un propietario concreto, **Then** recibe el resumen con el mismo criterio de cálculo.
4. **Given** un período sin actividad con fuentes completas, **When** se solicita el resumen, **Then** los contadores son cero y no se inventan tendencias.

### User Story 2 - Ingresos verificables (Priority: P1)

Como propietario quiero distinguir los ingresos por moneda y período y conocer qué movimientos los componen.

**Why this priority**: Los importes deben concordar con Payments y no con una estimación del precio de las reservas.

**Independent Test**: Un conjunto controlado de pagos aprobados, rechazados y reembolsos produce los totales esperados por moneda, sin contar dos veces un movimiento.

**Acceptance Scenarios**:

1. **Given** pagos en COP y USD, **When** se calculan ingresos, **Then** cada moneda conserva un total independiente, sin conversión implícita.
2. **Given** pagos pendientes o rechazados, **When** se calculan ingresos cobrados, **Then** esos pagos no incrementan el total.
3. **Given** un pago ya registrado, **When** se vuelve a recibir el mismo movimiento, **Then** no se duplica su importe.
4. **Given** una fuente incompleta o inaccesible, **When** se consulta el reporte, **Then** se informa la limitación y no se presenta un cero como ingreso comprobado.

### User Story 3 - Ocupación y tendencias (Priority: P1)

Como propietario quiero comparar las noches ocupadas con las noches disponibles de mis alojamientos y ver su evolución para detectar cambios de actividad.

**Why this priority**: Cumple el criterio explícito de ocupación del proyecto y requiere una capacidad verificable.

**Independent Test**: Con disponibilidad y estancias conocidas se verifica el recorte al período, la exclusión del día de salida y el resultado sin disponibilidad.

**Acceptance Scenarios**:

1. **Given** una habitación disponible diez noches y ocupada cuatro, **When** se calcula la ocupación, **Then** el resultado es 40 % y muestra ambos componentes.
2. **Given** una estancia que cruza el límite del período, **When** se calcula la ocupación, **Then** solo se cuentan las noches dentro de ese período y nunca el día de salida.
3. **Given** ausencia de noches disponibles verificadas, **When** se calcula la tasa, **Then** se muestra como no disponible con su motivo, sin dividir por cero ni asumir disponibilidad.
4. **Given** dos períodos comparables, **When** se muestra una variación con base previa cero, **Then** se indica que la variación porcentual no es calculable.

### User Story 4 - Consulta reproducible y visible (Priority: P2)

Como desarrollador o evaluador quiero iniciar Reports mediante Docker, consultar su documentación interactiva y verificar resultados conocidos sin usar credenciales ni datos personales reales.

**Why this priority**: Hace que el servicio se pueda demostrar y verificar de la misma manera que los servicios existentes.

**Independent Test**: En un entorno limpio se construye la imagen, se inicia el servicio con sus dependencias y se consultan las tres operaciones autenticadas con resultados reproducibles.

**Acceptance Scenarios**:

1. **Given** configuración local generada, **When** se inicia el entorno documentado, **Then** el servicio inicia en 3011 después de sus dependencias y migraciones.
2. **Given** datos sintéticos identificados como demostración, **When** se consultan los reportes, **Then** sus resultados coinciden con un conjunto esperado documentado.
3. **Given** un reinicio del servicio y su base, **When** se vuelve a consultar, **Then** los datos persistidos conservan sus resultados.
4. **Given** una petición sin autenticación o con un rol no permitido, **When** intenta consultar reportes, **Then** se rechaza sin revelar datos de negocio.

### Edge Cases

- Fechas inexistentes, rangos invertidos, intervalos excesivos y filtros desconocidos.
- Estancias que cruzan meses, años y límites del período; cancelaciones y reservas pendientes.
- Diferencia entre habitación y capacidad de huéspedes: una habitación de cuatro personas no representa cuatro habitaciones disponibles.
- Cambios de disponibilidad o propiedad; datos históricos que no pueden reconstruirse con el estado actual del alojamiento.
- Reembolsos en un período diferente al cobro; dinero con precisión entera y monedas distintas.
- Datos repetidos, desordenados, incompletos o con referencias aún no sincronizadas.
- Dependencias no disponibles: distinguir falta de datos de ausencia real de actividad.
- Falta de disponibilidad histórica: no publicar una tasa aparentemente exacta.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Permitir al propietario consultar exclusivamente sus métricas y al administrador consultar un propietario concreto; denegar acceso anónimo y a huéspedes.
- **FR-002**: Presentar reservas y desglose por estado, cancelaciones y tendencias para un intervalo explícito y un filtro opcional de alojamiento.
- **FR-003**: Mantener los mismos filtros y definiciones entre resumen, ocupación e ingresos; incluir en cada resultado el período y la fecha de actualización.
- **FR-004**: Separar los importes por moneda, conservar su precisión y excluir pagos no aprobados del total cobrado.
- **FR-005**: Definir el tratamiento de reembolsos y la fecha de reconocimiento: cobrado, reembolsado y neto por fecha de movimiento confirmado y moneda, seg?n respuesta del usuario.
- **FR-006**: Calcular la ocupación con noches de habitación dentro del período y una disponibilidad verificable; documentar antes de implementar qué estados de reserva contribuyen y qué noches se consideran disponibles.
- **FR-007**: Mostrar valores no calculables y fuentes incompletas explícitamente; no transformar errores o falta de disponibilidad en ceros comprobados.
- **FR-008**: Evitar duplicar reservas y movimientos ante reintentos y rechazar entradas inválidas antes de consultar o modificar datos.
- **FR-009**: Integrar ahora Reservas, Payments y Alojamientos por contratos internos autenticados, con datos de demostración separados e identificados.
- **FR-010**: Proveer arranque reproducible, documentación interactiva y verificación de autenticación, persistencia y resultados conocidos.
- **FR-011**: Incluir panel React integrado en StayHub, Docker y Swagger en esta entrega.
- **FR-012**: No exponer identidad de huéspedes, correo, secretos ni datos de tarjetas en reportes o registros.
- **FR-013**: Mantener las tres consultas de la imagen como contrato principal; documentar y probar cualquier contrato interno adicional necesario para integración.

### Key Entities *(include if feature involves data)*

- **Ámbito de reporte**: propietario, alojamiento opcional, período, agrupación y moneda.
- **Actividad de reserva**: identificador externo, propietario, alojamiento, habitación, estado y fechas relevantes, sin datos personales del huésped.
- **Movimiento de ingreso**: referencia de pago o reembolso, reserva, importe, moneda, estado y fecha del hecho económico.
- **Disponibilidad**: habitación, propietario y noches ofrecidas o bloqueadas para un intervalo, con fuente y límites históricos explícitos.
- **Resultado de reporte**: indicadores, series temporales, fuente, fecha de actualización y estado de completitud.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de los escenarios de prueba de acceso entre propietarios deniega información ajena; el administrador consulta solo el ámbito solicitado.
- **SC-002**: Los totales coinciden exactamente con los conjuntos de referencia de reservas y movimientos; repetir datos no modifica los resultados.
- **SC-003**: La ocupación coincide con las noches verificadas de los casos de referencia, incluidos cruces de períodos y disponibilidad cero o desconocida.
- **SC-004**: Cada resultado identifica su intervalo, moneda cuando corresponda y estado de actualización; ningún fallo de fuente se muestra como actividad cero verificada.
- **SC-005**: Un evaluador puede iniciar el entorno siguiendo la guía y reproducir los tres reportes con datos sintéticos identificados sin editar código.

## Assumptions

- Se conservan los roles existentes `OWNER`, `ADMIN` y `GUEST` y la autenticación de la plataforma.
- Primera propuesta de filtros: fechas y alojamiento; agrupación diaria o mensual. Límites, zona horaria y reglas exactas se documentarán en planificación antes de programar.
- No se incorporan exportación PDF/Excel, proyecciones predictivas ni conversión monetaria sin nueva decisión de alcance.
- Los datos sintéticos sirven para demostración y pruebas; no sustituyen una integración real ni se presentan como datos productivos.
- Un servicio sin datos históricos de disponibilidad no puede demostrar ocupación histórica exacta; el plan debe documentar la solución o su limitación.

## Constitution Check

- Alcance trazado a RQ-12, catálogo de servicios y Sprint 4.
- Mantener dominio, aplicación e infraestructura separados; no acceder a bases ajenas.
- Documentar REST y eventos utilizados, autenticación, permisos, reintentos y consistencia.
- Incluir pruebas de dominio, contratos, seguridad, persistencia y flujos entre servicios cuando se implementen; cobertura afectada mínima del 70 %.
- Incluir imágenes, Compose, verificaciones de salud, migraciones y evidencia de ejecución sin declarar PASS para comprobaciones no ejecutadas.
- No declarar finalización de calidad de proyecto sin CI y revisión de otro miembro; son requisitos distintos de la validación local.

## Decisiones confirmadas

El usuario confirmó todo el alcance visual, cobrado/reembolsado/neto por moneda e integración real con demostración separada el 2026-11-15.

Reglas: fechas UTC [from,to), máximo 366 noches; reservas por creación y cancelaciones por fecha de cancelación. Ocupación con CONFIRMED/CHECKED_IN/COMPLETED sobre oferta publicada por habitación, sin contar camas ni inferir bloqueos de Inventario. El historial comienza con la migración y conserva modificaciones posteriores; pasado sin evidencia devuelve tasa no disponible. El futuro se identifica como proyección.
