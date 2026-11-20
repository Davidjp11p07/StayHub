# Preparación del despliegue en Azure

## Consumo observado en integración

El 20 de noviembre de 2026 se midieron los 26 contenedores activos del proyecto `stayhub-integracion-local` en Docker Desktop. La VM de Docker tenía 16 CPU lógicas y 7,60 GiB de RAM y alojaba otros proyectos. Se tomaron siete muestras con `docker stats --no-stream` entre las 06:00:47 y las 06:01:29 UTC, sin lanzar una prueba de carga. Se sumaron los contadores de los 26 servicios en cada muestra antes de calcular la mediana y los extremos.

| Métrica del proyecto | Mínimo | Mediana | Máximo |
| --- | ---: | ---: | ---: |
| CPU consumida, en equivalentes de núcleo (100 % de Docker = 1 núcleo) | 0,31 | 2,91 | 3,57 |
| Memoria indicada por Docker, en MiB | 1007,6 | 1016,2 | 1067,3 |

Los 16 volúmenes montados ocuparon **605,6 MiB** según `du -sk`. El mayor fue PostGIS de Search con 109,5 MiB. Las capas escribibles de los 36 contenedores, incluidos los diez migradores terminados, sumaron 1,01 MiB. Las imágenes se contabilizan aparte y comparten capas. Como referencias individuales Docker indicó 997 MB para Bookings, 959 MB para Gateway y 757 MB para Reports.

## Implicaciones para la prueba de capacidad

Cuatro vCPU son una referencia inicial para una prueba de la pila: el máximo observado ya equivale al 89 % de esa capacidad. Antes de seleccionar el tamaño de producción, repetir la medición con reservas concurrentes, búsquedas y generación de informes; registrar latencia, errores y saturación. La equivalencia de núcleos entre la VM local y una VM de Azure es aproximada.

La RAM indicada corresponde a contenedores. Para dimensionar la VM falta medir el sistema operativo, la caché, el proxy HTTPS y el pico durante arranque y carga. Para dimensionar disco falta contabilizar imágenes por capas únicas, logs, crecimiento de fotos y bases, espacio temporal de actualización y retención de copias. Ollama y el frontend ejecutados fuera de este proyecto quedan fuera de estas cifras.
