# PPG ERP — Guía para agentes (router)

Este archivo **no contiene el detalle**: su único objetivo es indicarte **qué documento leer
según lo que el usuario quiera hacer**, para cargar sólo el contexto necesario. Ve de lo general
a lo particular y no asumas que algo vive donde "suena lógico": usa el mapa.

## Contexto mínimo

ERP propio de PPG que reemplaza a Odoo. Monorepo `pnpm`: **NestJS** (`apps/api`, :3001) +
**Next.js** (`apps/web`, :3000) + **Prisma/PostgreSQL** (`packages/db`). Documentación en la raíz
y en `docs/`. Entrega actual: **E3** (producción/reportes). Admin `admin`/`admin123`
(créditos y puertos en `docs/development.md`).

## Reglas básicas

1. **Lee solo lo necesario:** abre el documento del área (tabla de abajo); no cargues contexto que no vayas a usar.
2. **Actualiza la doc que revisaste si tu cambio la afecta**, en el mismo cambio.
3. **Catálogo:** usa ops declarativas (`docs/catalog-ops.md`), no scripts one-off.
4. **Migraciones:** nunca `prisma migrate dev` en shell no-TTY; usa `pnpm db:deploy`.
5. **Mapa vivo:** si mueves/renombras zonas, actualiza `project-nav.md`.
6. **Presupuesto de docs:** un doc de área debe caber en **≤150 líneas**; si crece, divídelo por tema
   o añade TOC. **Nunca leas un doc entero:** localiza la sección con `rg` y lee sólo ese rango.
   Los tomos de referencia (`REQUIREMENTS.md`, `docs/data-model.md`, `docs/plan-btvpe.md`) se leen
   **por sección**, no completos.
7. **Presupuesto de código:** guía **≤400 líneas** por archivo; revisa cuando pase de **600**.
   Si un archivo crece, extrae componentes/hooks/helpers antes de seguir añadiendo.
8. **Docs generados:** `docs/catalog-snapshot.{md,json}` es salida de `pnpm cat:snapshot`; **no** lo
   leas completo ni lo edites a mano: consúltalo con `rg` (o regenera).

Qué actualizar según el cambio:

- Rutas/zonas de código → `project-nav.md`
- Catálogo (atributos/valores/ejes/variantes/seed) → `docs/catalog-state.md` (+ `docs/roadmap.md` si hay pendientes)
- Reglas/patrones → `docs/conventions.md`
- Modelo de datos / migraciones → `docs/data-model.md` / `docs/development.md`
- Scripts/comandos → `docs/scripts.md`
- Despliegue/producción → `README.md` + `docs/development.md` (+ `docs/scripts.md` si cambian comandos)
- Trabajo hecho/pendiente → `docs/roadmap.md`

## Índice de documentación

| Documento | Úsalo cuando… |
|---|---|
| [`project-nav.md`](./project-nav.md) | necesites **ubicar una funcionalidad** en el código, el mapa API/Web, el atajo "tarea → archivos" o la estructura del repo. **Empieza aquí para casi todo.** |
| [`docs/development.md`](./docs/development.md) | necesites **comandos**, levantar el dev, aplicar migraciones, cambiar el motor de Postgres o credenciales/puertos. |
| [`docs/conventions.md`](./docs/conventions.md) | vayas a **escribir/modificar código** (patrones NestJS/Next, reglas de negocio técnicas, migraciones). |
| [`docs/data-model.md`](./docs/data-model.md) | toques el **modelo de datos** PPG (productos, atributos, cepillos, pasos, variantes). |
| [`REQUIREMENTS.md`](./REQUIREMENTS.md) | necesites el **qué y por qué** (visión, reglas de negocio §5, modelo de tablas §4, plan E0–E5 §10). |
| [`docs/catalog-ops.md`](./docs/catalog-ops.md) | vayas a **cambiar el catálogo** (atributos, valores, ejes, variantes) con ops YAML y el seed declarativo. |
| [`docs/catalog-state.md`](./docs/catalog-state.md) | necesites el **estado del catálogo** (decisiones vigentes, valores canónicos y pendientes). |
| [`docs/scripts.md`](./docs/scripts.md) | busques un **script** (seed, reorg, toolkit de catálogo, migración/reconciliación Odoo). |
| [`docs/plan-btvpe.md`](./docs/plan-btvpe.md) | trabajes en **productos tipo envase cosmético (BTVPE)**. |
| [`docs/roadmap.md`](./docs/roadmap.md) | necesites **pendientes**, deuda técnica o trabajo reciente/contexto. |
| [`README.md`](./README.md) | necesites **setup local / WSL2 / despliegue**. |

## Flujo general → particular

1. Identifica **qué quiere el usuario** (front, back, BD, catálogo, datos/Odoo, docs).
2. Según la tabla de arriba, abre **sólo** el documento del área (normalmente `project-nav.md`).
3. En `project-nav.md` (§2 API / §3 Web / §4 atajo) ubica el **archivo y la zona/línea** exactos.
4. Antes de editar, lee los patrones de `docs/conventions.md`.
5. Si toca datos/catálogo, ve a `docs/catalog-ops.md` (ops declarativas) en vez de escribir un script nuevo.

## Rutas de entrada por tipo de tarea

- **Backend (API):** `project-nav.md` §2 → módulo en `apps/api/src/<dominio>/` → `*.controller.ts`
  (rutas) y `*.service.ts` (lógica). Reglas: `docs/conventions.md`.
- **Frontend (web):** `project-nav.md` §3 → `apps/web/src/app/<ruta>/page.tsx` o
  `components/`; tipos en `lib/types.ts`, fetch con `lib/api.ts`.
- **Base de datos / migraciones:** `packages/db/prisma/schema.prisma` → flujo de migración en
  `docs/development.md` (genera con `--create-only`, aplica con `pnpm db:deploy`; **nunca**
  `migrate dev` en shell no-TTY). Modelo: `docs/data-model.md`.
- **Catálogo / atributos / variantes / seed:** `docs/catalog-ops.md` (cómo: ops YAML + `cat:*`) y
  `docs/catalog-state.md` (estado y pendientes); toolkit en `docs/scripts.md`. No crees scripts
  one-off. Tras ediciones manuales en la UI: `pnpm cat:export-seed`.
- **Migración / reconciliación Odoo:** `docs/scripts.md` (sección Odoo) + `docs/data-model.md`.
- **Reglas de negocio / requisitos:** `REQUIREMENTS.md` (+ `docs/plan-btvpe.md` para BTVPE).
- **Despliegue / producción:** `scripts/deploy.sh` + `docker-compose.yml` + `.env.production.example`;
  runbook en `README.md` y `docs/development.md` (sección *Despliegue a producción*). Regla: el
  esquema viaja por `migrate deploy` (automático al arrancar); fase 1 (prod nuevo) carga datos con un
  dump por la UI **Respaldos**, fase 2 (prod viva) solo migraciones.
- **Bugs de flujo ventas→desglose/fabricación o producción:** `project-nav.md` §2.2 (`ventas.confirmar`),
  §2.5 (`fabricacion`/`planificacion`) y §2.3 (`reportes.aplicar`); contexto en `docs/roadmap.md`.
