# PPG ERP — Guía para agentes (router)

Este archivo **no contiene el detalle**: su único objetivo es indicarte **qué documento leer
según lo que el usuario quiera hacer**, para cargar sólo el contexto necesario. Ve de lo general
a lo particular y no asumas que algo vive donde "suena lógico": usa el mapa.

## Contexto mínimo

ERP propio de PPG que reemplaza a Odoo. Monorepo `pnpm`: **NestJS** (`apps/api`, :3001) +
**Next.js** (`apps/web`, :3000) + **Prisma/PostgreSQL** (`packages/db`). Documentación en la raíz
y en `docs/`. Entrega actual: **E3** (producción/reportes). Admin `admin`/`admin123`
(créditos y puertos en `docs/development.md`).

## Índice de documentación

| Documento | Úsalo cuando… |
|---|---|
| [`project-nav.md`](./project-nav.md) | necesites **ubicar una funcionalidad** en el código, el mapa API/Web, el atajo "tarea → archivos" o la estructura del repo. **Empieza aquí para casi todo.** |
| [`docs/development.md`](./docs/development.md) | necesites **comandos**, levantar el dev, aplicar migraciones, cambiar el motor de Postgres o credenciales/puertos. |
| [`docs/conventions.md`](./docs/conventions.md) | vayas a **escribir/modificar código** (patrones NestJS/Next, reglas de negocio técnicas, migraciones). |
| [`docs/data-model.md`](./docs/data-model.md) | toques el **modelo de datos** PPG (productos, atributos, cepillos, pasos, variantes). |
| [`REQUIREMENTS.md`](./REQUIREMENTS.md) | necesites el **qué y por qué** (visión, reglas de negocio §5, modelo de tablas §4, plan E0–E5 §10). |
| [`docs/CATALOG-OPS.md`](./docs/CATALOG-OPS.md) | vayas a **cambiar el catálogo** (atributos, valores, ejes, variantes) con ops YAML declarativas. |
| [`docs/scripts.md`](./docs/scripts.md) | busques un **script** (seed, reorg, toolkit de catálogo, migración/reconciliación Odoo). |
| [`docs/plan-btvpe.md`](./docs/plan-btvpe.md) | trabajes en **productos tipo envase cosmético (BTVPE)**. |
| [`docs/roadmap.md`](./docs/roadmap.md) | necesites **pendientes**, deuda técnica o trabajo reciente/contexto. |
| [`README.md`](./README.md) | necesites **setup local / WSL2 / despliegue**. |

## Flujo general → particular

1. Identifica **qué quiere el usuario** (front, back, BD, catálogo, datos/Odoo, docs).
2. Según la tabla de arriba, abre **sólo** el documento del área (normalmente `project-nav.md`).
3. En `project-nav.md` (§2 API / §3 Web / §4 atajo) ubica el **archivo y la zona/línea** exactos.
4. Antes de editar, lee los patrones de `docs/conventions.md`.
5. Si toca datos/catálogo, ve a `docs/CATALOG-OPS.md` (ops declarativas) en vez de escribir un script nuevo.
6. Actualiza `project-nav.md` si mueves o renombras zonas relevantes.

## Rutas de entrada por tipo de tarea

- **Backend (API):** `project-nav.md` §2 → módulo en `apps/api/src/<dominio>/` → `*.controller.ts`
  (rutas) y `*.service.ts` (lógica). Reglas: `docs/conventions.md`.
- **Frontend (web):** `project-nav.md` §3 → `apps/web/src/app/<ruta>/page.tsx` o
  `components/`; tipos en `lib/types.ts`, fetch con `lib/api.ts`.
- **Base de datos / migraciones:** `packages/db/prisma/schema.prisma` → flujo de migración en
  `docs/development.md` (genera con `--create-only`, aplica con `pnpm db:deploy`; **nunca**
  `migrate dev` en shell no-TTY). Modelo: `docs/data-model.md`.
- **Catálogo / atributos / variantes:** `docs/CATALOG-OPS.md` (ops YAML) + `docs/scripts.md`
  (toolkit `scripts/catalog/`). No crees un script one-off nuevo.
- **Migración / reconciliación Odoo:** `docs/scripts.md` (sección Odoo) + `docs/data-model.md`.
- **Reglas de negocio / requisitos:** `REQUIREMENTS.md` (+ `docs/plan-btvpe.md` para BTVPE).
- **Bugs de flujo ventas→OFs o producción:** `project-nav.md` §2.2 (`ventas.confirmar`),
  §2.5 (`fabricacion`/`planificacion`) y §2.3 (`reportes.aplicar`); contexto en `docs/roadmap.md`.
