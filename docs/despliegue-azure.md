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

El archivo `docker-compose.production.yml` se aplica encima de `docker-compose.yml`. El único puerto publicado por los contenedores es `127.0.0.1:8080:8080`, donde escucha Gateway con HTTPS. NGINX recibe las conexiones públicas en el host. Reports queda disponible para Gateway en la red interna.

Preparar un archivo de entorno privado con los ajustes del Compose base y las cuatro entradas siguientes. Usar archivos TLS de producción y un directorio independiente para los secretos y archivos de Reports que referencia el modelo base.

| Variable obligatoria | Valor que debe proporcionar el operador |
| --- | --- |
| `STAYHUB_PUBLIC_API_URL` | URL HTTPS pública completa terminada en `/api/v1`. Se usa en las nuevas proyecciones de fotos y en la URL de Swagger. |
| `STAYHUB_PROXY_CIDRS` | CIDR del proxy inmediato tal como lo ve el contenedor Gateway. |
| `STAYHUB_GATEWAY_TLS_CERT` | Ruta absoluta al certificado interno del Gateway con un SAN que coincida con el nombre usado por NGINX. |
| `STAYHUB_GATEWAY_TLS_KEY` | Ruta absoluta a la clave privada correspondiente. |

Validar el modelo desde la raíz con el entorno de destino. Para un motor Ollama privado, configurar `OLLAMA_BASE_URL` con una dirección alcanzable desde Gateway. Si se omite, el destino es el loopback del contenedor y las respuestas que requieren el modelo pueden devolver HTTP 503.

```sh
docker compose --env-file "$STAYHUB_PROD_ENV" -p stayhub-prod \
  -f docker-compose.yml -f docker-compose.production.yml config --quiet
```

NGINX necesita la CA interna para verificar el certificado del Gateway. La prueba aislada confirmó que Compose monta certificado y clave en los destinos que lee el proceso. La negociación TLS se comprobó en el ensayo aislado descrito abajo.

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

En el ensayo local, NGINX sirvió el frontend compilado y validó el certificado del Gateway por su SAN. El proxy se ejecutó en un contenedor de la red aislada, con api-gateway:8080 como destino y puertos de loopback 28081/28443. nginx -t pasó. HTTP devolvió 308 conservando la ruta. Al cambiar el nombre TLS esperado por uno incorrecto, el proxy devolvió 502; al restaurarlo, Search volvió a responder 200.

Chrome abrió y recargó una ruta de propiedad, decodificó una foto pública y recibió un 404 JSON para una propiedad inexistente. El login emitió la cookie de renovación Secure, HttpOnly y SameSite=Strict con ruta /api/v1/auth/refresh. La recarga obtuvo 200 al renovar. Para repetir con el proxy activo, ejecutar scripts/e2e-verifier-session.mjs con STAYHUB_TEST_COMPOSE_PROJECT, NODE_EXTRA_CA_CERTS para el Gateway, STAYHUB_TEST_PROXY_ORIGIN y STAYHUB_TEST_PROXY_CERT para el certificado sintético del proxy. Chrome acepta para el ensayo la clave pública de ese certificado. DNS, confianza pública del certificado y acceso desde Internet quedan pendientes de una prueba externa autorizada.

## Copia y recuperación de datos

El inventario del 20 de noviembre de 2026 encontró **16 volúmenes montados** en integración. Compose enumera 11 por nombre. Los cinco restantes proceden de las imágenes de Redis y RabbitMQ. Al preparar una recuperación, obtener el montaje real de cada contenedor; el nombre del proyecto y el nombre lógico del volumen por sí solos no identifican un volumen anónimo.

| Datos | Servicios y almacenamiento | Qué recuperar |
| --- | --- | --- |
| PostgreSQL 16 | auth-db, users-db, accommodations-db, search-db, bookings-db, payments-db, reviews-db, notifications-db, inventory-db y reports-db; diez volúmenes en /var/lib/postgresql/data | Un archivo lógico por base, con esquema, datos, migraciones y estado de trabajo pendiente. Search requiere la imagen con PostGIS. Users incluye los bytes y SHA-256 de las fotos de perfil. |
| Fotos de alojamientos | accommodations_photos en /var/lib/stayhub/accommodations/photos | Archivos junto con la base de Accommodations que contiene sus referencias storageKey. |
| Mensajería | rabbitmq para Search y bookings-rabbitmq para reservas y pagos; dos montajes anónimos en /var/lib/rabbitmq | Para cada nodo, definiciones, datos de colas persistentes y estado del nodo en el mismo punto de corte. Registrar imagen, nombre de nodo real, nombre del host y volumen. |
| Redis | gateway-redis, auth-redis y search-redis; tres montajes anónimos en /data | Guardar la persistencia efectiva de cada instancia y distinguirla por servicio. Auth usa sesiones en caché y contadores de intentos de acceso; una restauración antigua puede reintroducir estado caducado o revocado. |

### Tomar una copia coherente

1. Abrir una ventana de mantenimiento. Suspender entradas nuevas, dejar terminar las solicitudes en curso y registrar reservas, movimientos de pago, tareas pendientes, mensajes listos, sin confirmar y en colas de error. Detener después las aplicaciones y trabajadores que escriben, incluidos los productores y consumidores de eventos. Mantener PostgreSQL disponible para los volcados. Anotar hora UTC, proyecto, commit, imágenes, versiones y el punto de corte por servicio. Cada pg_dump ofrece una instantánea de una base; la pausa de escrituras coordina el conjunto. [PostgreSQL 16: copias lógicas](https://www.postgresql.org/docs/16/backup-dump.html)
2. Crear un directorio privado en un disco con espacio comprobado. En Bash de Ubuntu, con `umask 077` y `set -euo pipefail`, repetir el siguiente bloque para los diez servicios PostgreSQL de la tabla. Definir `DC` como el array del comando Compose del proyecto de origen y `BACKUP_DIR` como directorio de esta ejecución. Conservar cada archivo solo si el comando termina correctamente.

   ```bash
   for service in auth-db users-db accommodations-db search-db bookings-db payments-db reviews-db notifications-db inventory-db reports-db; do
     "${DC[@]}" exec -T "$service" sh -ec 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$BACKUP_DIR/$service.dump"
     pg_restore --list "$BACKUP_DIR/$service.dump" > /dev/null
   done
   ```

   Usar herramientas PostgreSQL 16 compatibles. Los roles son globales al clúster. Registrar los roles y permisos necesarios y conservar sus credenciales por separado. La lectura del índice del archivo comprueba el formato; la prueba de recuperación exige importar los datos.
3. Archivar en modo de solo lectura el volumen de fotos, incluidas rutas relativas, propietarios y permisos. Registrar el montaje real y calcular sumas SHA-256 del archivo y de los volcados. Conservar todos los componentes bajo el mismo identificador de copia.
4. Para cada RabbitMQ exportar las definiciones con `rabbitmqctl export_definitions` mientras el nodo aún está disponible. Identificar su nombre con `rabbitmqctl status`. Detener el nodo de forma ordenada y archivar su directorio de datos completo, con permisos y cookie de Erlang protegidos. Las definiciones permiten reconstruir la topología; recuperar mensajes exige los datos del nodo. Preparar la restauración con la misma versión y el mismo nombre de nodo, especialmente si el host original usaba un identificador de contenedor. [RabbitMQ: copias y restauración](https://www.rabbitmq.com/docs/3.13/backup)
5. Para cada Redis consultar su modo de persistencia y el estado de la última escritura con `INFO persistence`. Usar la autenticación del entorno. Para RDB, solicitar una instantánea y esperar su finalización correcta antes de archivar; para AOF, conservar el conjunto completo, incluido su manifiesto cuando corresponda. Un respaldo en frío del directorio /data después del cierre ordenado evita copiar una reescritura en curso. En recuperación, revisar sesiones de Auth y decidir si invalidarlas y exigir nuevo login antes de habilitar tráfico. [Redis: persistencia y copias](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
6. Guardar el manifiesto y la copia cifrada fuera de la VM, por ejemplo en un contenedor privado de Azure Blob Storage con acceso de recuperación separado. Conservar por un canal protegido los secretos de servicio, claves de firma y material TLS necesarios para recuperar el entorno. Definir frecuencia y retención según la pérdida de datos admisible (RPO); medir el tiempo real de recuperación frente al objetivo (RTO). Volver a abrir el servicio tras comprobar salud y colas.

### Ensayar la restauración

Preparar un proyecto nuevo con volúmenes vacíos, redes y puertos propios y credenciales de prueba. Validar las sumas antes de importar. Arrancar solo las bases con las imágenes registradas y crear los roles requeridos. Restaurar en bases de destino vacías con propietarios y permisos compatibles; por ejemplo, en Bash con `RESTORE_DC` apuntando al proyecto de recuperación:

```bash
"${RESTORE_DC[@]}" exec -T "$service" sh -ec 'pg_restore --exit-on-error --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$BACKUP_DIR/$service.dump"
```

Restituir el árbol de fotos con sus permisos. Para servicios de mensajería y Redis, montar los datos restaurados en volúmenes exclusivos del ensayo y comprobar la identidad del nodo y la configuración de persistencia antes de arrancarlos. Revisar esquemas, extensiones y migraciones contra el commit del manifiesto; arrancar aplicaciones y trabajadores solo después de esas comprobaciones.

Cotejar recuentos y UUID de reservas, pagos y reseñas con el manifiesto. Abrir una foto de alojamiento y una de perfil y comparar su contenido. Consultar una propiedad por Search y conciliar un cobro y su reembolso con el informe LIVE. Verificar consumidores, mensajes pendientes y colas de error de ambos brokers, así como el comportamiento de las sesiones restauradas. Registrar diferencias, tiempo de recuperación y último movimiento confirmado recuperado. Esta unidad verificó los montajes; el ensayo de restauración queda pendiente.
