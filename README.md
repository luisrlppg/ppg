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
infra/        # Dockerfiles + Caddyfile (perfil full)
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
| `super` | `super123` | supervisor |
| `juan`  | `op123`    | operador |

## Despliegue completo (perfil full)

```bash
docker compose --profile full up --build
```

`caddy` en el puerto 80 expone `/api/*` → api y el resto → web.

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