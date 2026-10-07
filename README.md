# PPG ERP

ERP propio para PPG que reemplaza a Odoo. TypeScript full-stack: **NestJS (API) + Next.js (web)**,
base central **PostgreSQL** (propiedad exclusiva de `apps/api` vía Prisma), monorepo **pnpm**.

Diseño completo en [`REQUIREMENTS.md`](./REQUIREMENTS.md). Construcción incremental E0 → E5.

## Stack por entrega (estado)

| Entrega | Contenido | Estado |
|---|---|---|
| **E0** | Fundaciones: monorepo, docker-compose, Prisma base, auth (users/roles), shell de UI | ✅ entregado |
| E1–E5 | Ver `REQUIREMENTS.md` §10 (plan de entregas) | ⏳ pendiente |

## Estructura

```
apps/
  api/        # API NestJS (dueña de la base)
  web/        # App Next.js (una sola web)
packages/
  db/         # Prisma schema + seed (@ppg/db)
  shared/     # Tipos/constantes compartidos (@ppg/shared)
infra/        # Dockerfiles (perfil full)
```

## Requisitos

- Node.js ≥ 20, pnpm ≥ 9
- Docker + Docker Compose (para PostgreSQL y el despliegue completo)

## Puesta en marcha (dev local)

Forma recomendada — un solo comando (bootstrap + hot-reload en background):

```bash
cp .env.example .env
./scripts/ppg.sh start      # levanta Postgres (nativo o docker), instala deps,
                            # aplica migraciones y arranca api :3001 + web :3000
```

Gestión con `ppg` (alias en `~/.bashrc` → `scripts/ppg.sh`):

```bash
ppg start|restart|reload    # arrancar / reiniciar / aplicar migraciones + reiniciar
ppg stop|status|logs        # detener / estado / últimos logs
ppg db <native|docker|auto> # elegir motor de PostgreSQL (persistido en .env)
pnpm dev                    # alternativa: hot-reload en primer plano (Ctrl+C)
```

Manual (sin script):

```bash
pnpm install
pnpm db:up          # docker compose up -d postgres
pnpm db:deploy      # aplicar migraciones (no interactivo)
pnpm db:seed        # usuarios iniciales
pnpm dev            # API en :3001 + web en :3000 (web proxya /api → api)
```

La web escucha en `http://localhost:3000` y reenvía `/api/*` a la API (misma origin → cookies funcionan).

### Usuarios iniciales (solo dev)

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin123` | admin (configurado desde `.env`, ver seed) |
| `juan`  | `op123`    | operador |

## Despliegue completo (perfil full)

Requisitos: Docker con el plugin **buildx** (en Arch/CachyOS: `sudo pacman -S docker-buildx`)
y acceso al daemon (grupo `docker` o `sudo`). Postgres del stack = **`postgres:18-alpine`**
(igual que el motor nativo; el volumen va en `/var/lib/postgresql`).

```bash
# Si tu PostgreSQL nativo ya usa el 5432, publica el de compose en otro puerto:
POSTGRES_PORT=5433 docker compose --profile full up --build -d

# Primera vez: siembra roles + usuarios (migra + puebla auth). No arranca con "full".
# El catálogo NO se siembra aquí: se carga con un respaldo completo (UI Respaldos /
# scripts/deploy.sh restore) o con el seed declarativo `pnpm cat:seed`.
docker compose --profile tools run --rm seed
```

La **web** es la entrada única del stack: publica el puerto host `WEB_HOST_PORT`
(default **8090**) y proxya `/api/*` → `api:3001`. La API también se publica en
`API_HOST_PORT` (default **3001**) solo para acceso directo/depuración.

- La API **aplica las migraciones automáticamente** al arrancar (`infra/api-entrypoint.sh`).
- Entra en `http://localhost:8090` con `admin` / `admin123` (tras el seed).
- **Respaldos** funcionan dentro del stack (la UI `docs/backups` se monta en el contenedor y la
  imagen incluye el cliente PostgreSQL 18).
- La UI **Respaldos** muestra el commit/migración de este servidor (compara dev vs prod antes de
  restaurar).
- Revisa estado/logs con `docker compose --profile full ps` y `docker compose --profile full logs -f`.

### Promover dev → producción (servidor nuevo)

Hay dos carriles: el **esquema** siempre viaja automático (rebuild + `migrate deploy`), y los
**datos** según la fase.

**Fase 1 — producción aún no vive (clon literal de dev):**

```bash
# DEV: UI Respaldos → Crear (ej. "pre-prod") → Descargar .dump

# PROD (una sola vez, con el repo clonado):
cp .env.production.example .env.production   # edita secretos/puertos
./scripts/deploy.sh update                   # git pull + build + up + migraciones

# Carga los datos de dev: UI Respaldos (prod) → Subir .dump → Restaurar
#   (o por CLI: ./scripts/deploy.sh restore docs/backups/<archivo>.dump)
```

El restore es **atómico**, crea un **respaldo previo automático** y verifica que el dump no traiga
migraciones que el código desconozca (si es más nuevo, pide actualizar el servidor primero).

**Fase 2 — producción ya opera (solo esquema):** nunca restaures un dump; actualiza con
`./scripts/deploy.sh update` (la API aplica las migraciones pendientes). Los cambios de catálogo se
promueven con ops/seed declarativo (`pnpm cat:seed`), no sobrescribiendo.

### Gestor de despliegue `scripts/deploy.sh`

```bash
./scripts/deploy.sh update            # git pull + build + up + estado de migraciones
./scripts/deploy.sh status            # contenedores + migraciones aplicadas/pendientes
./scripts/deploy.sh logs [servicio]   # sigue logs
./scripts/deploy.sh backup [nombre]   # pg_dump -Fc -> docs/backups/
./scripts/deploy.sh restore [archivo] [--yes]
./scripts/deploy.sh down              # detiene el stack (conserva datos)
```

Lee `.env.production` si existe (o `.env`); alias en `package.json`: `pnpm deploy:prod`,
`deploy:status`, `deploy:backup`, `deploy:restore`. El borrado de usuarios (vista **Usuarios**)
se autoriza con `SUPER_ADMIN_PASSWORD` (defínela en `.env` / `.env.production`).


### Cargar los datos del Postgres local en el stack

```bash
# 1) Volumen del stack desde cero (solo borra los datos de Docker, no el nativo)
docker compose --profile full down -v

# 2) Dump fresco del nativo (5432)
pg_dump -h localhost -p 5432 -U ppg -d ppg -Fc -f docs/backups/ppg-pre-docker.dump

# 3) Levantar solo postgres (18) y restaurar
docker compose up -d postgres
pg_restore --clean --if-exists --no-owner --no-privileges \
  --single-transaction --exit-on-error \
  -h localhost -p 5433 -U ppg -d ppg docs/backups/ppg-pre-docker.dump

# 4) Levantar el resto (la API no tiene migraciones pendientes)
docker compose --profile full up -d
```

## Scripts útiles

```bash
pnpm db:studio   # explorar la base
pnpm build       # compila todos los paquetes
pnpm dev:api     # solo API
pnpm dev:web     # solo web
```

## WSL2 (Ubuntu) - Desarrollo Recomendado

WSL2 ofrece mejor experiencia de desarrollo que PowerShell en Windows.

### Paso 1: Instalar WSL2 (Windows Admin PowerShell)

```powershell
# Ejecutar como Administrador
wsl --install -d Ubuntu-22.04
```

### Paso 2: Configurar Ubuntu (primer inicio)

```bash
# Crear usuario y contraseña cuando lo pida
wsl -d Ubuntu-22.04
```

### Paso 3: Setup de desarrollo en Ubuntu

```bash
# Dentro de Ubuntu, instalar Node.js ≥ 20 y pnpm ≥ 9:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql
npm install -g corepack && corepack enable
corepack prepare pnpm@latest --activate
```

### Paso 4: Copiar proyecto a WSL2

Desde PowerShell Windows:
```powershell
# Copiar proyecto a WSL2
xcopy /E /I D:\documents\luisrlp\jobs\ppg\apps\erp \\wsl$\Ubuntu-22.04\home\[tu-usuario]\ppg-erp
```

O desde Ubuntu:
```bash
# Clonar o copiar el repo a ~/ppg-erp
cd ~/ppg-erp
```

### Paso 5: Configurar .env en WSL2

```bash
cd ~/ppg-erp
cp .env.example .env
```

### Iniciar desarrollo en WSL2

```bash
cd ~/ppg-erp

# Opción A: Un solo comando (recomendado)
./scripts/ppg.sh start

# Opción B: Manual
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME/bin:$PATH"
pnpm install
pnpm db:deploy
pnpm dev
```

> PostgreSQL: el motor se elige con `ppg db <native|docker>` (persistido como `PPG_DB_MODE`
> en `.env`). `native` usa `localhost:5432` (cluster Linux); `docker` levanta `docker compose`
> (pública en `localhost:5432`).

### Comandos útiles en WSL2

```bash
ppg start|stop|restart|reload|status|logs   # gestión api+web (hot-reload)
ppg db <native|docker|auto|stop>            # motor de PostgreSQL
pnpm db:studio        # Prisma Studio
docker ps             # Ver contenedores Docker de Windows
wsl -l -v            # Ver distribuciones WSL
```

### Notas importantes

- **Docker**: Usa Docker Desktop for Windows, accesible desde WSL2 via `docker` CLI
- **PostgreSQL**: corre en `localhost:5432` (nativo o contenedor Docker Compose del repo)
- **Archivos**: Accede desde Windows via `\\wsl$\Ubuntu-22.04\...` o desde Ubuntu via `/mnt/d/...`
- **Git**: Puedes usar Git desde Windows o WSL2 indistintamente