# Catálogo: snapshot + operaciones declarativas

Herramientas para cambiar el catálogo (atributos, valores, ejes y variantes) **sin escribir
un script nuevo por cada caso**. Separan *datos* (qué cambiar) de *motor* (cómo cambiarlo).

```
scripts/catalog/
  snapshot.ts     # solo lectura → docs/catalog-snapshot.{json,md}
  apply.ts        # motor: aplica un archivo YAML de operaciones
  odoo-diff.ts    # compara mapeo-odoo-ppg.csv ↔ PPG y propone ops
  lib/            # snapshot, parser de ops, motor, lector del crosswalk
  ops/            # archivos YAML de migración (versionados)
```

## Flujo recomendado (para una IA o humano)

1. **Ver estado**: `pnpm cat:snapshot` → `docs/catalog-snapshot.json` (canónico) y `.md` (resumen).
2. **Escribir** un archivo en `scripts/catalog/ops/<caso>.yaml` con las operaciones.
3. **Dry-run**: `apply.ts --file <caso>.yaml` (no escribe; muestra cambios, avisos y pendientes).
4. **Aplicar**: `apply.ts --file <caso>.yaml --apply` (transacción única, idempotente).
5. Si el caso viene de Odoo: `pnpm cat:odoo-diff` genera el reporte + un YAML propuesto para revisar.

Comandos directos (los alias `pnpm cat:*` son atajos):

```bash
pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/catalog/snapshot.ts
pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/catalog/apply.ts --file scripts/catalog/ops/mi-caso.yaml
pnpm exec dotenv -e .env -- pnpm --filter @ppg/db exec tsx ../../scripts/catalog/odoo-diff.ts
```

> Antes de `--apply`, crea un punto de retorno: `pnpm db:backup` (o `ppg backup [nombre]`).
> Restaura con `ppg restore` (ver [`scripts.md`](./scripts.md)). Nota: `pg_dump` no acepta el
> `?schema=public` de `DATABASE_URL`; los comandos de `ppg` ya lo manejan.

## Formato del archivo de ops

```yaml
version: 1
name: reorg-tipo-mango
description: elimina Tipo de Mango y sincroniza Pincel desde Mango
ops:
  - { op: value.add, value: Pelikan, attribute: Ceja }
  - { op: value.remap, fromAttr: "Tipo de Mango", fromValue: Pelikan, toAttr: Ceja, toValue: Pelikan }
  - { op: variant.deriveFrom, target: Pincel, source: Mango, on: ["Tamaño rosca", "Altura de Mango"], inherit: [Ceja, "Agujero de Mango"] }
  - { op: attr.delete, name: "Tipo de Mango" }
```

## Operaciones

| op | Campos | Qué hace |
|---|---|---|
| `attr.ensure` | `name`, `values?` | Crea el atributo (y valores) si no existe. |
| `attr.rename` | `from`, `to` | Renombra el atributo. |
| `attr.merge` | `from`, `into`, `prefer?` | Mueve variantes/ejes/permitidos/pasos al atributo destino y borra el origen. `prefer` (`target` por defecto) decide qué valor gana si la variante ya tenía valor en el destino. |
| `attr.delete` | `name`, `cascade?` | Borra el atributo. Si tiene variantes exige `cascade: true`. Aborta si está en `ProductPasso`. |
| `attr.assignAxis` | `product`, `attribute`, `sortOrder?` | Agrega el eje al producto (`ProductAttributeLine`). |
| `attr.unassignAxis` | `product`, `attribute` | Quita el eje y las asignaciones de las variantes de ese producto. |
| `attr.restrictValues` | `product`, `attribute`, `values` | Fija los valores permitidos del eje (`ProductAttributeValue`). |
| `attr.splitByProduct` | `from`, `into`, `values?` | Divide un atributo global en uno por producto (patrón de consolidación). |
| `value.add` | `attribute`, `value` | Agrega un valor al atributo. |
| `value.rename` | `attribute`, `from`, `to` | Renombra un valor. |
| `value.merge` | `attribute`, `from`, `into` | Fusiona dos valores del mismo atributo. |
| `value.delete` | `attribute`, `value`, `cascade?` | Borra el valor (aborta si está en uso salvo `cascade`). |
| `value.remap` | `fromAttr`, `fromValue`, `toAttr`, `toValue` | Mueve las variantes de (atributo,valor) a (atributo,valor) destino. |
| `variant.set` | `sku`, `attribute`, `value` | Fija el valor de un eje en una variante. |
| `variant.clear` | `sku`, `attribute` | Quita el valor de un eje en una variante. |
| `variant.create` | `product`, `sku`, `nombre?`, `attrs` | Crea una variante con sus valores. |
| `variant.copy` | `from`, `sku`, `overrides?` | Clona una variante cambiando valores. |
| `variant.deriveFrom` | `target`, `source`, `on`, `inherit` | Hereda valores del producto fuente por combinación de `on` (solo si es único). |
| `variant.delete` | `sku`, `allowStock?` | Borra la variante (aborta con historial; `allowStock` borra stock/movimientos). |
| `step.repoint` | `product`, `fromAttribute`, `toAttribute` | Re-apunta `ProductPasso` de un atributo a otro. |
| `category.ensure` | `nombre` | Crea la categoría si no existe. |
| `location.ensure` | `nombre`, `tipo?` | Crea la ubicación si no existe. |
| `packaging.ensure` | `nombre` | Crea el empaque si no existe. |
| `product.define` | `nombre`, `sku`, `uom?`, `category?`, `basePrice?`, `hasVariants?`, `vendible?`, `imagen?`, `activo?` | Crea/actualiza un producto (meta). `vendible` = aparece en el modal de Ventas. |
| `variant.define` | `sku`, `product`, `nombre?`, `attrs`, `price?`, `min?`, `max?`, `longLead?`, `activo?`, `imagen?`, `notas?` | Crea/actualiza una variante y **define** sus valores de eje + meta. |
| `bom.set` | `product`, `components: [{ component, cantidad, tipo }]` | Reemplaza el BOM del producto. |
| `step.set` | `product`, `steps: [{ sortOrder, panel?, pregunta, attribute?, variantProduct? }]` | Reemplaza los pasos de tienda del producto. `panel` agrupa pasos que se muestran juntos. |
| `packaging.set` | `sku`, `empaques: [{ nombre, cantidad }]` | Reemplaza los empaques de la variante. |
| `stock.set` | `sku`, `location`, `qty` | Fija el stock (apertura) y registra el movimiento. |

## Garantías

- **Idempotente**: correr dos veces no vuelve a cambiar nada (reporta "ya estaba").
- **Transaccional**: si una op falla, no se aplica ninguna.
- **Dry-run por defecto**: sin `--apply` no escribe.
- **Guardas**: no borra valores/atributos en uso, detecta colisiones, respeta `ProductPasso`
  y el historial de variantes (ventas/OFs/reportes/precios).
- **Sin SQL crudo**: solo el vocabulario de arriba.

## `odoo-diff`

Lee `scripts/odoo-migration/mapeo-odoo-ppg.csv` (atributos ya normalizados a nombres PPG)
y compara contra el snapshot. Genera:

- `docs/odoo-diff-report.{md,csv}`: por SKU, `faltante`, `conflicto`, `valor_nuevo`,
  `sin_variante`, `sin_producto`, `sin_eje`.
- `scripts/catalog/ops/odoo-diff-<fecha>.yaml`: `value.add` + `variant.set` para lo seguro;
  los conflictos van **solo** al reporte para revisión.

No escribe en la base de datos.

## Seed declarativo (catálogo + stock)

El catálogo completo se puede **exportar** desde la BD a ops *ensure/define* y luego **aplicar**
para reproducirlo en otra base (o tras un reset), sin depender de scripts one-off.

```bash
pnpm cat:export-seed     # genera scripts/catalog/seed/catalog.yaml + stock.yaml desde la BD actual
pnpm cat:seed            # aplica catalog.yaml (dry-run; usa --apply para escribir)
pnpm cat:stock           # aplica stock.yaml (dry-run; usa --apply para escribir)
```

- `catalog.yaml`: categorías, ubicaciones, empaques, productos, atributos+valores, ejes
  (+ permitidos), BOM, pasos y variantes (valores + meta). **Versionado.**
- `stock.yaml`: stock por variante+ubicación. Es una **foto** (se vuelve obsoleta con los
  movimientos); por eso va aparte.
- El export es fiel a la BD: correr `cat:seed`/`cat:stock` sobre la misma base da **0 cambios**.
- Reconstrucción desde cero verificada: migrar en un schema vacío + `cat:seed` + `cat:stock`
  reproduce los mismos conteos que la BD actual.

## Notas

- El snapshot y los reportes de diff son regenerables y están en `.gitignore`; los archivos
  de `ops/` **sí** se versionan.
- Los scripts one-off históricos (`scripts/reorg-*.ts`, `consolidar-atributos.ts`, etc.)
  se conservan como referencia de lo ya aplicado; los casos nuevos van como ops.
