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
pnpm db:seed                # auth: roles + usuarios (admin/operador) + estado del monitor
pnpm db:seed:products       # BOM + ejes + passos del storefront (requiere productos ya sembrados)
pnpm cat:seed               # catálogo declarativo (catalog.yaml; dry-run; --apply para escribir)
pnpm cat:stock              # stock de apertura (stock.yaml; dry-run; --apply para escribir)
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
- `restore` detiene api+web, **sobrescribe** los datos, **aplica las migraciones pendientes**
  (`db:deploy` + `prisma generate`) y avisa cuándo volver a levantar (`ppg start`). Acepta `.dump`
  (custom) o `.sql` (texto plano). Así un respaldo viejo no deja la BD desactualizada.
- Los comandos usan la URL sin `?schema=public` (pg_dump/pg_restore/psql no aceptan ese query param).
- El restore es **atómico y transaccional**: en una sola transacción hace
  `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;` y luego vuelca el respaldo (con
  `psql --single-transaction` + `ON_ERROR_STOP=1`). Si algo falla, revierte todo en vez de dejar la BD
  a medias, y el detalle del error se propaga (UI y CLI).

#### Restaurar en otra instancia o stack full (Docker)

Un dump `pg_dump -Fc` incluye **esquema + datos**. Nunca lo restaures sobre una BD que ya tiene el
esquema (p. ej. un stack que ya arrancó la API y migró): el `CREATE TABLE` choca y verás
`relation ... already exists`, `column ... does not exist` y errores de PK/FK.

Tampoco basta `pg_restore --clean --if-exists`: sus `DROP` **no usan `CASCADE`**, así que un objeto
del destino que ya no existe en el dump (p. ej. una tabla borrada en una migración posterior) bloquea
el drop y verás `cannot drop constraint ... because other objects depend on it`. Por eso el restore
recrea el schema `public` completo antes de aplicar.

1. Asegura que el código/imagen destino incluya las migraciones del dump (o posteriores).
2. Deja la BD vacía: `docker compose --profile full down -v` y `docker compose up -d postgres`.
3. Restaura **con la API apagada** (recrea `public` y aplica en una transacción):
   ```bash
   export PGPASSWORD=ppg
   { echo 'DROP SCHEMA IF EXISTS public CASCADE;'; echo 'CREATE SCHEMA public;';
     pg_restore --clean --if-exists --no-owner --no-privileges --file - \
       docs/backups/ppg-<fecha>.dump; } \
     | psql -h localhost -p "${POSTGRES_PORT:-5432}" -U ppg -d ppg \
         -v ON_ERROR_STOP=1 --single-transaction -f -
   ```
4. Levanta el resto (`docker compose --profile full up -d`): la API aplica migraciones pendientes al
   arrancar y concilia el esquema. Alternativa: con solo `postgres` arriba, restaurar desde la UI
   (menú **Respaldos**) o `ppg restore`, que hacen lo mismo de forma atómica.

### Gestor de servidores `scripts/ppg.sh`

Alias `ppg` (en `~/.bashrc`). Único gestor de api+web: `start|stop|restart|reload|status|logs|db`.
- `start` hace bootstrap completo (Postgres + deps + migraciones) y arranca api+web con hot-reload en background. **No siembra.**
- `reload` aplica migraciones y reinicia.
- `db <native|docker|auto|stop>` elige el motor de Postgres (persistido como `PPG_DB_MODE` en `.env`).

### Motor de PostgreSQL

- `native`: usa `localhost:5432` (cluster Linux).
- `docker`: levanta `docker compose` con **`postgres:18-alpine`** (el host lo publica según
  `POSTGRES_PORT` de `.env`, default 5432).
- Elige con `ppg db <native|docker>`; queda en `.env`.

## Despliegue a producción (Docker Compose)

El código viaja por `git pull` + rebuild en el servidor; el **esquema** se aplica solo
(`infra/api-entrypoint.sh` corre `migrate deploy` al arrancar). Los **datos** siguen dos carriles:

- **Fase 1 (prod aún no vive):** clon literal de dev. Dev descarga un dump por la UI de
  **Respaldos**; en prod se sube y restaura (o `scripts/deploy.sh restore`). El restore es atómico,
  crea un **respaldo previo automático** y **rechaza dumps con migraciones más nuevas** que el
  código desplegado (hay que actualizar primero).
- **Fase 2 (prod viva):** nunca se restaura un dump; solo `deploy.sh update`. Los cambios de
  catálogo se promueven con ops/seed declarativo (`cat:seed`), que es idempotente.

```bash
cp .env.production.example .env.production   # secretos/puertos (no reutilizar los de dev)
./scripts/deploy.sh update                   # git pull + build + up + estado de migraciones
./scripts/deploy.sh status                   # contenedores + migraciones aplicadas/pendientes
./scripts/deploy.sh restore docs/backups/<archivo>.dump [--yes]
```

Variables clave de `.env.production`: `POSTGRES_USER/PASSWORD/DB`, `JWT_SECRET`, `WEB_HOST_PORT`,
`API_HOST_PORT`, `ADMIN_*`. El compose compone `DATABASE_URL` desde las credenciales de Postgres.
La página **Respaldos** muestra el commit y la última migración del servidor (útil para comparar
dev vs prod antes de restaurar). Detalle del flujo en [`../README.md`](../README.md).

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
