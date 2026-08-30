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

## Servidores en Windows (sin bloquear la terminal)

`scripts/dev.ps1` arranca/detiene api y web **desacoplados** (no bloquean el chat/terminal):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 up      # postgres + api + web
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 stop    # detiene api y web
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 status  # puertos 3000/3001
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1 logs    # tail api.log / web.log
```