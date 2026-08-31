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

```bash
pnpm install
pnpm db:up          # docker compose up -d postgres
pnpm db:migrate     # prisma migrate dev (crea tablas base)
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

## Servidores en Windows (PowerShell, sin bloquear la terminal)

```powershell
powershell -ExecutionPolicy Bypass -File start-dev.ps1
```

## WSL2 (Ubuntu) - Desarrollo Recomendado

WSL2 ofrece mejor experiencia de desarrollo que PowerShell en Windows.

### Paso 1: Instalar WSL2 (Windows Admin PowerShell)

```powershell
# Ejecutar como Administrador
powershell -ExecutionPolicy Bypass -File scripts\wsl2-setup.ps1
```

### Paso 2: Configurar Ubuntu (primer inicio)

```bash
# Crear usuario y contraseña cuando lo pida
wsl -d Ubuntu-22.04
```

### Paso 3: Setup de desarrollo en Ubuntu

```bash
# Dentro de Ubuntu, ejecutar:
curl -sL https://raw.githubusercontent.com/anomalyco/ppg-erp/main/scripts/wsl2-dev-setup.sh | bash

# O copia scripts/wsl2-dev-setup.sh desde el repo y ejecuta:
bash ~/wsl2-dev-setup.sh
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

# Opción A: Script de inicio
bash scripts/wsl2-start-dev.sh

# Opción B: Manual
export DATABASE_URL="postgresql://ppg:ppg@host.docker.internal:5433/ppg"
pnpm install
pnpm dev
```

### Comandos útiles en WSL2

```bash
pnpm dev              # API + Web
pnpm --filter @ppg/api dev   # Solo API (puerto 3001)
pnpm --filter @ppg/web dev   # Solo Web (puerto 3000)
pnpm db:studio        # Prisma Studio
docker ps             # Ver contenedores Docker de Windows
wsl -l -v            # Ver distribuciones WSL
```

### Notas importantes

- **Docker**: Usa Docker Desktop for Windows, accesible desde WSL2 via `docker` CLI
- **PostgreSQL**: La base corre en Docker de Windows, se accede desde WSL2 via `host.docker.internal`
- **Archivos**: Accede desde Windows via `\\wsl$\Ubuntu-22.04\...` o desde Ubuntu via `/mnt/d/...`
- **Git**: Puedes usar Git desde Windows o WSL2 indistintamente

## Servidores en Windows (PowerShell, alternativa)

`scripts/dev.ps1` arranca/detiene api y web **desacoplados** (no bloquean el chat/terminal):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 up      # postgres + api + web
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 stop    # detiene api y web
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 status  # puertos 3000/3001
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 logs    # tail api.log / web.log
```