# catalog-state.md — Estado del catálogo

Qué está **vigente hoy** en el catálogo y qué falta. Para *cómo* cambiarlo ver
[`catalog-ops.md`](./catalog-ops.md); para las entidades y tablas, [`data-model.md`](./data-model.md).

## Decisiones vigentes (reorgs ya aplicados)

- **Vendible (2026-10-04):** el selector de Ventas usa `Product.vendible` (no `ProductVariant.published`,
  retirado). Están marcados los 6 con pasos: TP, BTVPE-D/LG/N/S/TN. Se exporta a `catalog.yaml`
  (`product.define` con `vendible: true`).
- **Taparrosca (2026-10-04):** `Altura de Taparrosca` se fusionó dentro de `Forma de
  Taparrosca` (el número es la forma; `Bala`/`Rebeca`/`Gg` conservan nombre; su altura va a
  `notas`). Se eliminó la variante errónea `TPR-0016`. Ops: `scripts/catalog/ops/taparrosca-wizard.yaml`.
- **Taparrosca con Pincel consolidado (2026-10-04):** hay **un solo** producto. Se conservó la fila
  de Odoo (`P0019`, 19 variantes con stock), renombrada a **`Taparrosca con Pincel`**, y se retiró el
  prototipo nativo `TP` (id 5). Se remapearon sus ejes legado
  (`Tipo de Tapa con Pincel`+`Altura de Taparrosca`→`Forma de Taparrosca`,
  `Color de Tapa con Pincel`→`Color de Taparrosca`, `Medida pincel`→`Altura de Mango`) y se agregó
  el BOM + wizard. Se **borraron** `Altura de Taparrosca`, `Color de Tapa con Pincel`,
  `Tipo de Tapa con Pincel` y `Medida pincel`. `Gg` y `Gris` se agregaron a `Forma de Taparrosca`
  y `Color de Taparrosca`. Ops: `scripts/catalog/ops/taparrosca-con-pincel-ensamble.yaml`.
  Ver [`plan-taparrosca.md`](./plan-taparrosca.md).
- **Wizard de Taparrosca con Pincel (2026-10-05):** sus 6 pasos tenían `panel: 0` (se veían todos
  juntos); se reasignó `panel: 1..6` (un paso por pantalla, con cascada de opciones al avanzar).
  Ops: `scripts/catalog/ops/taparrosca-paneles.yaml`.
- **BTVPE (2026-10-04):** eje `Tamaño de Botella` en Botella (`Mini`/`Alta`/`Chica`/`Grande`);
  se retiró `Capacidad de Botella` (mL → `notas`); `Color de Cepillo Silicon` (Blanco/Negro) eje de
  Cepillo Silicon; nylon usa `Color de Cerda de Cepillo` (se retiró `Color de Cepillo Nylon`);
  BTVPE usan `Forma de Sobretapa`. Wizard en **Modelo B** (ops `scripts/catalog/ops/btvpe-reconciliacion.yaml`).
- **Vastago:** sin `Agujero de Vastago` (lo sustituye `Punta`). `Tipo de Vastago` = `Normal`, `Mod-prosa`.
- **`Tipo de Mango` eliminado:** `Pelikan` pasó a `Ceja`; `Normal`/`Plano` se tradujeron a
  `Agujero de Mango`. `Ceja` = `Delgada`, `Gruesa`, `Pelikan`.
- **Taparrosca:** `Tipo de Taparrosca` se fusionó en `Forma de Taparrosca` (gana Forma);
  `Mini yadis` → `Yadis`.
- **Pincel** hereda `Ceja` y `Agujero de Mango` de **Mango** por `(Tamaño rosca, Altura de Mango)`.
- **Pigmentos (2026-10-07):** producto **`Pigmento`** (`PIG`, **comprable**, `uom kg`) con 4 ejes
  (`Resina de Pigmento` PP/PE·PVC, `Tipo de Pigmento` Polvo·Masterbatch, `Color de Pigmento`,
  `Fabricante de Pigmento`) y los **30** pigmentos diferidos de Odoo materializados con
  `Resina`+`Color` (SKU `PIG-<PP|PE|PVC>-<código>`). Costo de compra **por variante**
  (`ProductVariant.costoCompra`, editable en `/costos`). Ops:
  `scripts/catalog/ops/pigmentos.yaml`.
- Histórico de los reorgs: `docs/scripts.md` (§ reorganizaciones one-off).

## Valores canónicos (atributos tocados)

| Atributo | Valores |
|---|---|
| `Forma de Taparrosca` | Normal, Bala, Hexagonal, Triangular, Rebeca, Yadis, Gg |
| `Tipo de Vastago` | Normal, Mod-prosa |
| `Ceja` | Delgada, Gruesa, Pelikan |

## Pendientes

- **Taparrosca:** 12 variantes sin `Forma de Taparrosca` (captura manual).
- **Pincel `PIN-0011`** (15/28): sin Mango equivalente → `Ceja`/`Agujero de Mango` pendientes.
- **Crosswalk** `mapeo-odoo-ppg.csv`: `VST-0014`, `VST-0021`, `VST-0022`, `VST-0023` **no son
  obsoletos**: se migraron y luego `reorg-vastago.ts` los eliminó a propósito (Tipo
  Externo/Casquillo/Sin rosca). Su existencia física quedó registrada en el **inventario histórico**
  (`docs/inventario-historico-inicial.csv` → `/inventario-historico`, junto con `TPR-0016` y los
  cepillos `Reciclado/Desconocido`), **fuera** del inventario vivo. `cat:odoo-diff` los seguirá
  reportando como `sin_variante`; decidir si se limpian del crosswalk o quedan como histórico.
  Consolidado en [`odoo-pendientes.csv`](./odoo-pendientes.csv).
- **`pnpm db:seed` desalineado:** usa nombres viejos (`Altura vastago`, `Forma tapa`…).
  `cat:seed` es el seed bueno del catálogo; decidir si se alinea `seed.ts` o se retira de ahí la
  parte de atributos/productos para no duplicar.
- **Pigmentos:** falta capturar `Tipo` (Polvo/Masterbatch) y `Fabricante` de las 30 variantes; el
  `Color` puede repetirse entre variantes hasta que `Fabricante` las desambigüe. Stock inicial
  pendiente (`pp 1992 MASTER ROSA` traía 25 Units en Odoo y no se cargó).

## Capturar cambios manuales

Si editas valores de variantes en la UI, quedan en la BD pero **no** en el repo. Para no perderlos
al recrear la base, corre **`pnpm cat:export-seed`** y commitea `scripts/catalog/seed/catalog.yaml`.

*Última actualización: 2026-10-07.*
