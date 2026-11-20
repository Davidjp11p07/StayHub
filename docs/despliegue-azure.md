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

## Entrada HTTPS y rutas del navegador

Se propone una VM Ubuntu con NGINX en el host y los servicios en Docker Compose. Un único nombre DNS público apunta a la IP del proxy. El grupo de seguridad de red de Azure y el cortafuegos del host permiten entrada pública TCP en 80 (redirección a HTTPS) y 443 (aplicación). La administración de la VM requiere una ruta privada independiente. PostgreSQL, Redis, RabbitMQ y Ollama quedan en redes privadas. [Grupos de seguridad de red de Azure](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview)

| Petición pública | Destino | Comportamiento esperado |
| --- | --- | --- |
| HTTPS para una ruta de pantalla, por ejemplo /login | Frontend compilado en el host | Servir el archivo si existe y usar index.html al recargar una ruta de React. |
| HTTPS para /assets/ | Archivos de la compilación | Servir JS y CSS; responder 404 si falta el archivo. |
| HTTPS para /api/v1/ | Gateway HTTPS en 127.0.0.1:8080 | Preservar ruta, consulta, cuerpo, estado HTTP y cookies. |
| HTTP en el puerto 80 | Proxy público | Redirigir al nombre HTTPS configurado. |

Desde la raíz del repositorio en Linux, compilar con `VITE_API_BASE_URL=/api/v1 npm run build:web` y publicar el contenido de `apps/web/dist/`. El frontend y la API comparten origen, por lo que el navegador puede usar la cookie de renovación con su ruta y atributos originales sin habilitar CORS entre dominios. Configurar `ACCOMMODATIONS_SEARCH_PUBLIC_API_URL` con el origen HTTPS público seguido de `/api/v1` para las nuevas proyecciones de fotos. Verificar también la portada de un alojamiento ya indexado si se migra el catálogo.

### Conexión privada entre NGINX y Gateway

El Compose principal publica 8080 en todas las interfaces. En el futuro override de producción reemplazar esa lista con `ports: !override ["127.0.0.1:8080:8080"]` para Gateway y con `ports: !override []` para Reports. Los microservicios usan sus nombres de Compose para comunicarse. El certificado público del dominio se termina en NGINX; el Gateway conserva su TLS interno. Configurar `GATEWAY_TLS_CERT_SOURCE` y `GATEWAY_TLS_KEY_SOURCE` con el certificado y la clave del entorno. NGINX necesita la CA interna y un nombre que coincida con el SAN del certificado del Gateway.

Fragmento para el bloque HTTPS de NGINX, una vez definidos el nombre interno del certificado, la CA y la ruta de publicación. El valor `gateway.interno` ilustra un SAN que debe sustituirse por el elegido en el despliegue. [Directivas de proxy de NGINX](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)

```nginx
root /srv/stayhub/web;
location /assets/ { try_files $uri =404; }
location / { try_files $uri $uri/ /index.html; }
location ^~ /api/ {
    client_max_body_size 8m;
    proxy_pass https://127.0.0.1:8080;
    proxy_ssl_server_name on;
    proxy_ssl_name gateway.interno;
    proxy_ssl_trusted_certificate /etc/nginx/stayhub/gateway-ca.pem;
    proxy_ssl_verify on;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

El límite de 8 MiB deja margen al multipart de una foto de hasta 5.000.000 bytes. Configurar `GATEWAY_TRUSTED_PROXY_CIDRS` para el par inmediato que ve el contenedor al recibir tráfico desde el proxy del host; comprobar esa dirección en la red de destino antes de fijarla.

### Comprobaciones de aceptación

En esta unidad se compiló el frontend de producción con base relativa. Pendiente en un ensayo del proxy: validar la configuración con `nginx -t`, abrir y recargar una ruta profunda desde el navegador, iniciar sesión y comprobar la renovación, verificar una foto pública y confirmar que un error de /api/v1/ conserva su respuesta de API. Antes de publicar, comprobar la redirección HTTP, la cadena TLS pública y la verificación TLS del salto interno.
