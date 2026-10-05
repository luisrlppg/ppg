# development.md — Stack, comandos y flujo de cambio

Entorno de desarrollo de PPG ERP. Para la ubicación de archivos ver `project-nav.md`;
para reglas de código `conventions.md`.

## Stack

Monorepo con `pnpm` workspaces: `apps/api` (NestJS, puerto **3001**) + `apps/web`
(Next.js App Router, puerto **3000**, proxy `/api` → 3001) + `packages/db` (Prisma/PostgreSQL).
Todo TypeScript. Sin Redux/react-query en web.

## Comandos

```bash
export PNPM_HOME="$HOME/.local/share/pnpm"   # pnpm instalado independiente de corepack
export PATH="$PNPM_HOME/bin:$PATH"

pnpm install                # instalar / sincronizar dependencias
pnpm dev                    # levanta api (3001) + web (3000) con hot-reload en paralelo
pnpm dev:api / dev:web      # levantar sólo uno
pnpm --filter @ppg/api build
pnpm db:deploy              # APLICAR migraciones SIN interactividad (usar SIEMPRE en shell no-TTY/CI)
pnpm db:seed                # auth + catálogos + ubicaciones + clientes + atributos + productos base
pnpm db:seed:products       # BOM + ejes + passos del storefront (requiere productos ya sembrados)
pnpm db:studio              # visor de datos Prisma
pnpm db:backup [nombre]     # punto de retorno de la BD -> docs/backups/
pnpm db:restore [archivo]   # restaura un respaldo (el más reciente si se omite)
```

### Punto de retorno (respaldos)

Desde la **UI**: menú **Respaldos** (`http://localhost:3000/backups`, sólo `admin`) — crear, listar,
descargar, subir, restaurar y eliminar.

Desde CLI, para pruebas que puedan escribir datos no reales:

```bash
ppg backup pre-prueba       # o: pnpm db:backup pre-prueba
# ... pruebas ...
ppg restore                 # restaura el .dump más reciente (pide confirmación)
ppg restore docs/backups/ppg-<fecha>-pre-prueba.dump --yes
```

- `backup` vuelca la BD con `pg_dump -Fc` en `docs/backups/ppg-<fecha>[-nombre].dump` (comprimido).
- `restore` detiene api+web, **sobrescribe** los datos (`pg_restore --clean --if-exists`), **aplica
  las migraciones pendientes** (`db:deploy` + `prisma generate`) y avisa cuándo volver a levantar
  (`ppg start`). Acepta `.dump` (custom) o `.sql` (texto plano). Así un respaldo viejo no deja la BD
  desactualizada.
- Los comandos usan la URL sin `?schema=public` (pg_dump/pg_restore/psql no aceptan ese query param).

### Gestor de servidores `scripts/ppg.sh`

Alias `ppg` (en `~/.bashrc`). Único gestor de api+web: `start|stop|restart|reload|status|logs|db`.
- `start` hace bootstrap completo (Postgres + deps + migraciones) y arranca api+web con hot-reload en background. **No siembra.**
- `reload` aplica migraciones y reinicia.
- `db <native|docker|auto|stop>` elige el motor de Postgres (persistido como `PPG_DB_MODE` en `.env`).

### Motor de PostgreSQL

- `native`: usa `localhost:5432` (cluster Linux).
- `docker`: levanta `docker compose` (pública en `localhost:5432`).
- Elige con `ppg db <native|docker>`; queda en `.env`.

## Flujo estándar de cambio

1. Identifica la funcionalidad en `project-nav.md` (§2 API o §3 Web) o en el atajo (§4).
2. Lee el/los archivo(s) indicados, empezando por la zona señalada.
3. Respeta los patrones de `conventions.md`.
4. Si cambias el esquema (`packages/db/prisma/schema.prisma`): crea migración con
   `pnpm --filter @ppg/db exec prisma migrate dev --name <nombre> --create-only`,
   revisa el SQL y aplica con `pnpm db:deploy`. **No edites migraciones ya aplicadas.**
5. Valida con `pnpm --filter @ppg/api build` y comprobando en `http://localhost:3000`.

> **¡IMPORTANTE!** `prisma migrate dev` es **interactivo** y se CONGELA en shells sin TTY
> (como el de un agente de coding). Para aplicar migraciones en configuraciones no interactivas
> usa **siempre** `pnpm db:deploy` (usa `migrate deploy`). Para generar, `--create-only`.

## Credenciales y puertos

| Recurso | Valor |
|---|---|
| Admin | `admin` / `admin123` |
| PostgreSQL | `postgresql://ppg:ppg@localhost:5432/ppg` (native o Docker, mismo puerto) |
| API | `http://localhost:3001` |
| Web | `http://localhost:3000` |

Docker Desktop (Windows) accesible vía `host.docker.internal`.
