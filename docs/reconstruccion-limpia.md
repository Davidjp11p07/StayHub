# Reconstrucción aislada desde Git en Windows

Ejecutar desde la raíz del worktree de integración con PowerShell, Python 3, Git, Node 20, npm, Chrome, Docker Desktop con Compose y Buildx, y OpenSSL en PATH. Se necesitan acceso a los registros de paquetes e imágenes, espacio para una segunda pila y puertos libres 38080 y 38443. La exportación de origen para BuildKit contiene exclusivamente archivos versionados; las credenciales y node_modules se generan en la copia de ejecución contigua. Elegir un identificador de proyecto nuevo en cada ensayo.

```powershell
$repo = (Get-Location).Path
$commit = (git rev-parse HEAD).Trim()
$project = 'stayhub-clean-' + (Get-Date -Format 'yyyyMMddHHmmss')
$env:COMPOSE_PARALLEL_LIMIT = '1'
$env:COMPOSE_BAKE = 'false'
$env:Path = 'C:\Program Files\Git\mingw64\bin;' + $env:Path
python scripts/prepare-clean-install.py $project $commit
if ($LASTEXITCODE) { throw 'Falló la preparación' }
$runDir = Join-Path $repo ".artifacts/$project"
Push-Location $runDir
npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE) { throw 'Falló la instalación' }
node scripts/generate-compose-dev-env.mjs
if ($LASTEXITCODE) { throw 'Falló la generación del entorno' }
Pop-Location
python scripts/prepare-clean-install.py $project $commit --configure
if ($LASTEXITCODE) { throw 'Falló la configuración' }
Set-Location $runDir
$dc = @('compose','-p',$project,'-f','docker-compose.yml','-f','docker-compose.local.yml','-f','docker-compose.clean-test.yml','-f','.artifacts/clean-networks.json')
docker @dc config --quiet
if ($LASTEXITCODE) { throw 'Modelo inválido' }
docker buildx create --name $project --driver docker-container
if ($LASTEXITCODE) { throw 'Se requiere un constructor nuevo' }
docker buildx inspect --bootstrap $project
if ($LASTEXITCODE) { throw 'Constructor indisponible' }
Push-Location src-clean
$groups = Get-Content ../.artifacts/build-groups.json -Raw | ConvertFrom-Json
foreach ($targets in $groups) {
    docker buildx bake --builder $project --pull --load --progress plain -f fresh-bake.json @targets
    if ($LASTEXITCODE) { throw "Falló el build de $targets" }
}
Pop-Location
docker @dc pull --ignore-buildable
if ($LASTEXITCODE) { throw 'Falló la descarga de infraestructura' }
docker @dc up -d --no-build --pull never --wait --wait-timeout 300
if ($LASTEXITCODE) { docker @dc ps --all; throw 'Revisar migraciones y salud' }
docker @dc ps --all
$env:STAYHUB_TEST_COMPOSE_PROJECT = $project
$env:NODE_EXTRA_CA_CERTS = (Resolve-Path .artifacts/gateway/tls_cert.pem).Path
$env:STAYHUB_TEST_PROXY_CERT = $env:NODE_EXTRA_CA_CERTS
$env:STAYHUB_TEST_PROXY_ORIGIN = 'https://localhost:38443'
node scripts/e2e-verifier-session.mjs
if ($LASTEXITCODE) { throw 'Falló el recorrido funcional' }
docker @dc stop
Set-Location $repo
```

El modelo usa 14 subredes propias y puertos en loopback. La elección de subred considera las rutas del host y redes Docker al preparar el ensayo. El frontend de aceptación reutiliza el certificado sintético de localhost para los dos saltos TLS. En producción los certificados del borde y del Gateway se provisionan por separado. El flujo funcional deja sus datos sintéticos en los volúmenes de este proyecto.
