# scripts.md — Catálogo de scripts

Scripts de utilidad en `scripts/`. Para cambios de catálogo, prefiere el toolkit declarativo
de [`catalog-ops.md`](./catalog-ops.md); los scripts one-off quedan como referencia histórica.
Para datos/migración Odoo, ver la sección al final.

## Seed y demo

- `packages/db/prisma/seed.ts` — **bootstrap de auth**: roles (`admin`/`operador`), usuario admin
  (desde `ADMIN_*`) y `monitorState`. **No siembra catálogo**: eso vive en el seed declarativo
  (`scripts/catalog/seed/`, ver [`catalog-ops.md`](./catalog-ops.md)).
- `seed-products.ts` — **legacy** (usa nombres de atributo viejos; el seed vigente es `cat:seed`,
  ver [`catalog-ops.md`](./catalog-ops.md)): configura estructura BOM + `ProductAttributeLine` + `ProductPasso`.
- `seed-demo.ts` — siembra variantes reales + stock para probar el flujo E3 (reportes/producción);
  idempotente.
- `seed-demo-ventas.ts` — variantes únicas + toma una variante de "Taparrosca con Pincel" (`P0019`)
  para probar ventas → confirmación → desglose (E2); idempotente.
- `seed-cepillos-notas.ts` — carga medidas/grosor de cepillos como nota interna (`ProductVariant.notas`);
  idempotente. `--dry`/`--apply`.
- `reset-variants.ts` — limpia variantes y atributos/valores.

## Respaldos — `scripts/ppg.sh backup|restore`

Punto de retorno rápido de la BD (datos reales). Ver [`development.md`](./development.md).

- `ppg backup [nombre]` → `pg_dump -Fc` a `docs/backups/ppg-<fecha>[-nombre].dump` (comprimido).
- `ppg restore [archivo] [--yes]` → detiene api+web y restaura de forma **atómica**: recrea el schema
  `public` (`DROP SCHEMA ... CASCADE`) y aplica el respaldo en una sola transacción
  (`psql --single-transaction` + `ON_ERROR_STOP=1`), tanto para `.dump` (custom) como `.sql` plano
  (sin archivo, usa el más reciente). Si algo falla, revierte todo. Al terminar **aplica las
  migraciones pendientes** (`db:deploy`) y regenera el cliente Prisma. Para restaurar en otra
  instancia/stack full ver
  [`development.md`](./development.md#restaurar-en-otra-instancia-o-stack-full-docker).
- Alias: `pnpm db:backup` · `pnpm db:restore`.
- `docs/backups/` está en `.gitignore`.
- **UI:** `apps/web/src/app/backups/page.tsx` + `apps/api/src/backups/` (módulo NestJS, sólo `admin`)
  hacen lo mismo desde el navegador (crear/descargar/subir/restaurar/eliminar); el restore de la UI
  corre `db:deploy` + `prisma generate` al terminar, crea un **respaldo previo automático** y
  **rechaza dumps con migraciones desconocidas** por el código (con rollback al respaldo previo).

## Despliegue a producción — `scripts/deploy.sh`

Gestor del stack `full` en el servidor de producción. Lee `.env.production` (o `.env`).
Ver el runbook en [`development.md`](./development.md#despliegue-a-producción-docker-compose).

- `update [-b|--build] [tag]` — `git pull --ff-only` + `docker compose pull` (o `build` con
  `-b`/`--build`) + `up -d` + espera salud + `migrate status`. El `tag` opcional permite
  desplegar/rollback a una imagen concreta (`PPG_TAG`, por defecto `latest`). Con `-b`/`--build`
  (o `PPG_BUILD=1`) exporta `GIT_SHA`/`BUILD_TIME` (visibles en `/api/health` y la UI de Respaldos).
- `pull` — descarga las imágenes del registry (GHCR) sin levantarlas.
- `status` — contenedores + migraciones aplicadas/pendientes.
- `logs [servicio]` — sigue logs.
- `backup [nombre]` — `pg_dump -Fc` dentro del contenedor postgres → `docs/backups/`.
- `restore [archivo] [--yes]` — respaldo previo, `DROP SCHEMA` + `psql --single-transaction` atómico,
  `migrate deploy` y `up -d`.
- `down` — detiene el stack (conserva el volumen `pgdata`).
- Alias: `pnpm deploy:prod` · `deploy:pull` · `deploy:status` · `deploy:backup` · `deploy:restore`.

Las imágenes las publica CI (`.github/workflows/publish.yml`) en `ghcr.io/luisrlppg/ppg-{api,web,tools}`
con tags `<sha>` y `latest`. Si son privadas: `docker login ghcr.io -u <usuario> -p <PAT>`.

## Reorganizaciones one-off (histórico)

Todas soportan `--dry`/`--apply`.

- `reorg-atributos.ts` — split/rename de atributos por producto desde `atributos-mapping.csv`
  (re-apunta variantes, ejes, permitidos y pasos).
- `consolidar-atributos.ts` — consolidación: splits, merges, repunts, renombres, borrado de muertos
  y normalización de valores (primera mayúscula + colisiones).
- `finalizar-minmax.ts` — crea el producto PVC y asigna la forma a los Pino del Cepillo Nylon.
- `reorg-cepillos.ts` — Cepillo Nylon por `Forma` + `Grosor cerda` + `Color` (elimina `Estado` y
  `Medidas`); Cepillo Silicon por forma; convierte medidas del "Cepillo Recto" en formas; borra
  `Medidas` y `Estado` del catálogo.
- `reorg-cepillos-grosor.ts` — quita el eje `Grosor cerda` (va a `notas`); codifica el grosor en la
  forma (5.75" → `… Prosa`, 4" → `Bala/Pino Barradas`); borra valores de Forma huérfanos.
- `reorg-palillos.ts` — separa `Palillo`: renombra id 42 → `Palillo Sin Cepillo`, crea
  `Palillo Citologico Sin Cepillo`, `Palillo con Cepillo` y `Palillo Citologico con Cepillo`; define BOM.
- `reorg-vastago.ts` — elimina `Agujero de Vastago` (lo sustituye `Punta`) y deja `Tipo de Vastago`
  sólo con `Normal` y `Mod-prosa`.
- `completar-vastago.ts` — completa `Color de Vastago`/`Punta` de las 10 variantes sin derivar de Odoo.
- `reorg-tipo-mango.ts` — elimina `Tipo de Mango` y sincroniza `Pincel` con `Mango`
  (hereda `Ceja`/`Agujero`); crea `PIN-13mm-35mm-plano`.
- `remapear-plano.ts` — remapeo auxiliar.

## Migración y reconciliación Odoo

> Los CSV de Odoo y algunos scripts de migración viven en rutas ignoradas por git; se conservan localmente.

- `odoo-migration/step8-clientes.ts` — migra `scripts/odoo-data/contacts.csv` a Clientes (`Partner`):
  separa `Persona, Empresa`, omite direcciones hijas, descarta email de prueba, limpia teléfonos y
  normaliza a Título; idempotente por nombre+empresa. `--dry` no escribe y genera `clientes-revision.csv`.
- `odoo-migration/step9-min-max.ts` — aplica `stockMin/stockMax` desde `min-max.csv` (resuelve por
  `familiaOdoo`+atributos con `variantes.csv`). Soporta `--file`, `--apply`, `--factor` y `--pendientes`.
- `odoo-migration/step10-materializar.ts` — materializa variantes faltantes desde
  `materializar-faltantes.csv` (clona `baseSku` + `overrides`), crea valores y fija min/máx.
- `odoo-migration/reconcile-stock.ts` — reconcilia `docs/odoo_inv.csv` contra la existencia de PPG
  (BD `StockLevel` por defecto; `--ppg <csv>` usa un export): mapea con `mapeo-odoo-ppg.csv`, deja
  subensamblados pendientes y excluye pigmentos/oficina. Genera
  `docs/odoo-inventario-diferencias.csv` + `docs/odoo-inventario-correccion.csv`. `--apply` fija
  `StockLevel` (motivo `ajuste`) sólo en renglones `ajuste`; **`--reset`** borra el stock y recarga
  el snapshot Odoo **preservando** el de pigmentos (`PIG-*`, migrado aparte). Destructivo: usar
  `ppg backup` antes.
- `odoo-migration/mapeo-odoo-ppg.csv` — crosswalk vivo **por variante**:
  `sku, producto, uom, familiaOdoo, atributos, stockMin, stockMax, origen(odoo|nuevo)`.
- `odoo-migration-plan.ts` — plan de migración.
- [`docs/odoo-pendientes.csv`](../docs/odoo-pendientes.csv) — **registro consolidado** de lo que no
  quedó 1:1 en PPG (crosswalk eliminado, subensambles/sin mapear/solo Odoo de inventario, mín/máx
  pendientes, pendientes de catálogo y **pigmentos**, hoy `migrado`). Se arma a partir de
  `odoo-diff-report.csv`, `odoo-inventario-diferencias.csv`, `min-max-{pendientes,omitidos}.csv`,
  `mapping-odoo.csv` (pigmentos, `accion=diferido`) y `catalog-state.md`.
  Los pigmentos (`PE`/`PP`/`PVC`) se dejaron fuera de alcance a propósito: `reconcile-stock.ts` los
  excluye (y `--reset` los preserva), así que no aparecen en `odoo-inventario-diferencias.csv`; se
  migraron aparte al producto `Pigmento` (ops `scripts/catalog/ops/pigmentos.yaml` para los 30
  codificados y `pigmentos-pastas.yaml` para el stock: `pp 1992` + 39 pastas en `PIG1/PIG2/PIG3`;
  ver `catalog-state.md`).
- [`docs/inventario-historico-inicial.csv`](../docs/inventario-historico-inicial.csv) — carga inicial
  del **inventario histórico** (existencias de descontinuados + subensambles Odoo, aisladas del
  inventario vivo). Se importa desde `/inventario-historico` (`POST /inventario-historico/importar`).
  10 descontinuados + 51 subensambles = 61 filas / 272.284 u.

## Toolkit de catálogo (actual) — `scripts/catalog/`

Ver detalle y formato de ops en [`catalog-ops.md`](./catalog-ops.md).

- `snapshot.ts` → `docs/catalog-snapshot.{json,md}` (estado canónico, **generado**: no leer completo
  ni editar a mano; consúltalo con `rg`).
- `apply.ts --file <ops.yaml> [--apply]` — motor genérico de ops declarativas (idempotente, transaccional).
- `odoo-diff.ts` — compara `mapeo-odoo-ppg.csv` ↔ PPG y propone ops.
- `export-seed.ts` — vuelca el catálogo actual a `scripts/catalog/seed/catalog.yaml` (+ `stock.yaml`).
- Alias: `pnpm cat:snapshot` · `cat:apply` · `cat:odoo-diff` · `cat:export-seed` · `cat:seed` · `cat:stock`.
- Casos nuevos: YAML en `scripts/catalog/ops/` (los `odoo-diff-*.yaml` son regenerables/ignorados).
